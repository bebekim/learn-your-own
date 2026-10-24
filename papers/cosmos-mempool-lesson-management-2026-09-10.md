# What LYO can borrow from Cosmos block construction

Research date: 2026-09-10. Scope: Cosmos transaction construction, CometBFT mempools and proposal validation, Skip Block SDK lanes and MEV auction mechanics, with one explicitly Ethereum-specific comparison. This extends the [lesson-management research assessment](lesson-management-research-2026-09-10.md). It is architectural inspiration, not a recommendation to install blockchain infrastructure or equate auction success with useful learning.

## Version and inspection boundary

The inspected version is **Block SDK v2.1.5**, pinned to commit `1ea62f3eed1927073562600ba25915f323ee15a3`; the GitHub tag API confirms that identity. Source behavior below takes precedence over README examples, some of which use different constructor signatures. The upstream repository is archived and says it is no longer maintained, so this is a historical implementation reference. No code was installed or executed. [Pinned tag](https://github.com/skip-mev/block-sdk/tree/v2.1.5), [current repository status](https://github.com/skip-mev/block-sdk).

## Transaction and proposal lifecycle: verified foundation

This comparison uses Cosmos SDK v0.50.0's transaction schema and CometBFT v0.38.0's ABCI specification, plus versioned v0.38 mempool documentation. These are concrete architectural references, not a claim that every current Cosmos chain has identical mempool or auction behavior.

A standard Cosmos transaction carries a body of executable messages, authorization information, and signatures. The schema includes signer sequence numbers, target-chain information in the signing document, and an optional timeout height. The transaction identity pins exact bytes; ordering transactions does not grant permission to rewrite their signed instructions. [Cosmos SDK v0.50.0 transaction schema](https://github.com/cosmos/cosmos-sdk/blob/v0.50.0/proto/cosmos/tx/v1beta1/tx.proto).

Many participants can submit transactions, but the selected proposer constructs the block for a round. Its application can choose and reorder transactions through PrepareProposal. ProcessProposal performs deterministic application checks using the proposed content and committed state. This separates proposal construction from acceptance rules. [Cosmos SDK application mempool](https://docs.cosmos.network/sdk/v0.50/build/building-apps/app-mempool).

A flood mempool is node-local: it checks incoming transactions, disseminates accepted ones to peers, and can have a different arrival order from another node. With rechecking enabled, pending transactions are checked again after a block commits. Inclusion deferred at one proposal is not equivalent to permanent rejection. [CometBFT v0.38 mempool](https://docs.cosmos.network/cometbft/v0.38/docs/core/mempool).

ABCI permits application-defined transformation of proposed transaction data, but explicitly warns that replacing or aggregating transactions loses client traceability unless the application retains derivation links. It suggests retaining hashes of originating transactions. This flexibility does not bypass a Cosmos application's authorization rules. [CometBFT v0.38.0 ABCI methods, PrepareProposal](https://github.com/cometbft/cometbft/blob/v0.38.0/spec/abci/abci%2B%2B_methods.md).

## Lanes classify and allocate capacity

`LanedMempool.Insert` walks an ordered registry and inserts into the **first matching lane**. Lanes have separate selection logic and relative priority. Configuration validates unique names and block-space allocations. During proposal construction, a base lane obtains byte/gas limits, selects transactions, updates the partial proposal, and passes it onward. These are policy-controlled queues and capacity limits; matching does not emerge from transaction success. Nothing in insertion chooses a worker to perform a task. [Pinned mempool implementation](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/block/mempool.go), [base lane proposal processing](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/block/base/abci.go).

## The MEV lane selects a submitted bundle

The MEV lane ranks bids by coin amount. Its prepare handler iterates bids in priority order, skips invalid ones, and selects the first valid bid and its bundled transactions. It then stops. Its process handler requires the submitted bundle to occur in the declared order and compares encoded transaction bytes. This is selection and ordering of supplied operations; it is not semantic rewriting of their intentions. Verification does not prove that the selected bid was the highest existing anywhere: the prepare handler acts on its available pool, while proposal processing checks the proposed contents. [Pinned bid priority](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/lanes/mev/mempool.go), [prepare/process handlers](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/lanes/mev/abci.go).

## Validation is contextual, but narrower than successful execution

The custom MEV `CheckTx` validates a bid and its bundled transactions against a cached view of the latest committed state, discarding those tentative changes. It removes invalid bids from its lane. The auction timeout check requires the intended execution height exactly: next height during check/recheck/simulation, current height otherwise. Proposal checks also enforce resource limits, bundle identity/order, and no nested bids. However, `BaseLane.VerifyTx` runs the configured **ante-handler chain**; the inspected code does not execute all application message handlers there. Therefore these checks do not establish successful business effects or atomic rollback across an entire multi-transaction bundle. [Pinned MEV check](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/abci/checktx/mev_check_tx.go), [timeout validation](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/x/auction/ante/utils.go), [VerifyTx](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/block/base/abci.go).

## A high bid means willingness to pay, not user benefit

Auction rules check bid denomination, reserve price, and, when applicable, a minimum increment over the observed top bid. Funds go to an escrow address and a configured proposer-reward destination. Optional front-running protection constrains signer ordering to disallow particular front-running/sandwich patterns. It is not a universal welfare evaluator. The code measures payable value and rule compliance; it does not measure improved outcomes for every affected user. An LYO score made from an agent's declared confidence would lack even the auction's actual payment constraint. [Pinned auction validation, payment distribution, and signer checks](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/x/auction/keeper/auction.go), [execution modes for top-bid comparison](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/x/auction/ante/ante.go).

## “Reassignment” needs a separate meaning

The inspected lane machinery classifies submissions and chooses their inclusion order. The default prepare handler rechecks lane membership and returns mismatching transactions for removal; it does not transfer them to another executor or rediscover the right lane. Changing queue membership, changing transaction order, replacing a proposal, and delegating work are different operations. A LYO design can implement the last operation, but should describe it as its own capability rather than inherit it from the mempool analogy. [Pinned default prepare handler](https://github.com/skip-mev/block-sdk/blob/1ea62f3eed1927073562600ba25915f323ee15a3/block/base/proposals.go).

## Ethereum-specific comparison: searchers, builders, proposers

Flashbots separates searchers submitting bundles, builders composing execution payloads, and validators choosing proposals through relays. Builders combine public transactions, bundles, and private order flow, then bid for proposer blockspace. The stated optimization is profit; block scoring tracks the fee recipient's balance change and is explicitly not a complete measure of extractable value. This helps distinguish competing candidate construction from final proposal selection. It is an Ethereum MEV-Boost architecture, not a property automatically supplied by Cosmos lanes. [Flashbots builder documentation](https://docs.flashbots.net/flashbots-mev-boost/block-builders), [searcher/builder architecture](https://docs.flashbots.net/flashbots-auction/overview).

## LYO interpretation: what is the transaction?

The reusable lesson is durable knowledge under revision. A request to register, apply, assess, or revise that lesson is transaction-like. Its particular opportunity can finish or expire while the underlying lesson remains available. Treating a lesson as consumed after one use would defeat reuse.

The following are proposed mappings, not existing Cosmos features or a new LYO implementation:

| Mechanism | Useful LYO equivalent |
|---|---|
| Transaction envelope | Exact lesson version, proposed operation, source identity, context, evidence references, and expected prior version. |
| Local mempool admission | Admit a well-formed, traceable hypothesis for consideration without certifying that it helps. |
| Gossip and differing local pools | Share candidate identities and evidence; each session builds a view appropriate to its current work. |
| Proposal construction | Assemble a small, compatible plan of advice or experiments for the next meaningful decision. |
| Proposal validation | Check current applicability, evidence/version integrity, evaluator suitability, and conflicting instructions before use. |
| Execution and receipt | Record actual delivery, application, and measured outcome separately. |
| State-dependent recheck | Revisit eligibility when tools, task conditions, lesson versions, or supporting evidence change. |
| Derivation tracking | Preserve which observations and earlier versions a merged, split, or generalized lesson came from. |

Agreement that a record is valid is different from evidence that an intervention works. Structural and identity checks can be deterministic. Semantic applicability may need attributed judgment; causal benefit requires an appropriate experiment or explicitly weaker observational analysis. A majority of agents endorsing a hypothesis is not a substitute.

Validators aim to replicate an agreed state transition. LYO nodes work on different tasks and environments. They should agree on evidence identity and what was recorded, while being allowed to reach different delivery decisions for different contexts.

## How several nodes could constitute one useful lesson

Use the actual candidate `shell-python-quote-boundary` as a starting point:

1. One session supplies the failure and its original command. Retained event: `hook-ab949e1215e86c6019532f97`.
2. The same historical episode supplies a later quoted-heredoc form, event `hook-84ac5a4fea2fa30b68173917`. Local analysis established a syntax difference; it did not establish that the remote operation completed.
3. A future agent could propose a narrower rule about preserving Python source across a shell boundary. Another could propose direct argument passing where the execution API permits it. Both proposals must retain their source lineage.
4. A receiving session supplies the missing context: shell interpretation or direct argv, intended command, and available evaluator. It selects only an applicable variant.
5. Later independent work tests whether delivering that variant improves the predefined result relative to ordinary work. Counterexamples distinguish a broken claim, missing precondition, unnecessary reminder, and defective measurement.

Steps 3–5 are proposed work, not observations already obtained. Multiple summaries of the same two events remain one historical episode. Copying evidence between nodes cannot increase the independent sample count.

A minimally constituted candidate therefore contains:

- **Claim and action:** what should change and why it might help.
- **Conditions and exclusions:** where the claim applies and what remains unknown.
- **Prediction and falsifier:** what observable result would support or contradict it.
- **Evaluator identity:** the check, its version, and what it actually measures.
- **Provenance and version:** originating events, author/reviewer identity, and previous versions.
- **Separate evidence states:** technical validity, observed application, incremental benefit, and tested scope.

Most of this information already exists for registered findings in [session-finding-evidence.ts](../src/lyo/interface/session-finding-evidence.ts), particularly its input schema and registerFindingOpportunity. Existing [finding revision](../src/lyo/interface/session-findings.ts) also rejects stale previous versions and records evidence references. The missing work is automatic intake and routing through ordinary sessions, not inventing a second ledger.

There is a material integration constraint: the current registration API requires a prior delivery receipt. It supports checking advice before the advised action, but cannot by itself provide the pre-delivery eligibility and assignment record needed for a no-added-advice comparison. That boundary must be handled explicitly.

## Selection value and the MEV boundary

MEV concerns value obtainable through transaction inclusion, exclusion, and ordering. Searchers identify opportunities and submit transactions; the economic return need not equal an end-user benefit. [Ethereum's MEV documentation](https://ethereum.org/developers/docs/mev/). This is a useful general definition, not a claim that Ethereum's builder architecture is standard Cosmos behavior.

For LYO, a proposed plan should identify the user outcome it aims to improve. A proposer's confidence is a prediction, not a bid that purchases truth or priority. Use measured contextual benefit where available; retain uncertainty where it is not. Experiments should resolve consequential uncertainty and preserve a comparison against ordinary work.

Composition matters: “resolve the current workspace, then build paths, then read files” has dependencies that independently ranked reminders can miss. Conversely, redundant or conflicting advice should not fill a prompt just because each item has a high standalone score. Begin with one experimental lesson per opportunity; introduce bundle-effect evaluation only when real interactions require it.

What the user calls reassignment maps best to rescheduling an eligible application or review at a suitable future node. A passed opportunity remains missed; do not fabricate its pre-action data or relabel a later task as the original trial. Reuse the lesson with a new opportunity ID and newly recorded context.

## Minimal architectural consequence

Keep SQLite and the existing evidence receipts. Add a candidate admission path and local context selection that lead into measured applications and versioned revisions. Check the current lesson state immediately before delivery, then let later evidence change subsequent selection.

No token economy, staking, blockchain, multi-validator voting, new network broker, or cryptographic-signature system is required for this local workflow. Author identity and content hashes provide attribution/integrity bookkeeping; they are not proof of truth or cryptographic authentication.

The decisive demonstration is a later real session receiving different guidance because a prior outcome changed the lesson or its applicability, followed by evidence that this change improves outcomes. “Accepted into the pool,” “included in a prompt,” and “committed to the ledger” are intermediate events, not successful learning.

This note changes documentation only. Existing specifications, runtime code, hooks, and live databases were not modified.
