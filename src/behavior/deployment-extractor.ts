export interface ExtractedHookDeployment {
  provider: string | null;
  environment: string | null;
  target: string | null;
  status: 'attempted' | 'succeeded' | 'failed' | 'unknown';
}

const DEPLOYMENT_TOOLS = new Set([
  'releasectl',
  'terraform',
  'kubectl',
  'helm',
]);

const DOCKER_DEPLOY_SUBCOMMANDS = new Set(['push', 'pull']);
const AWS_DEPLOY_SUBCOMMANDS = new Set(['deploy']);
const GCLOUD_DEPLOY_SUBCOMMANDS = new Set(['deploy', 'app', 'run', 'services', 'deploy']);

export function extractDeployment(
  commandName: string,
  argv: string,
  status: 'attempted' | 'succeeded' | 'failed' | 'unknown',
): ExtractedHookDeployment | null {
  if (!isDeploymentTool(commandName, argv)) return null;

  const provider: string | null = commandName;
  const environment = extractEnvironmentFlag(argv);
  const target = extractTarget(commandName, argv);

  return { provider, environment, target, status };
}

function isDeploymentTool(commandName: string, argv: string): boolean {
  if (DEPLOYMENT_TOOLS.has(commandName)) return true;
  if (commandName === 'docker') return isDockerDeploy(argv);
  if (commandName === 'aws') return isAwsDeploy(argv);
  if (commandName === 'gcloud') return isGcloudDeploy(argv);
  return false;
}

function isDockerDeploy(argv: string): boolean {
  const parts = argv.split(/\s+/);
  const subcommand = parts[1] ?? '';
  return DOCKER_DEPLOY_SUBCOMMANDS.has(subcommand);
}

function isAwsDeploy(argv: string): boolean {
  const subcommand = secondToken(argv);
  return subcommand === 'deploy';
}

function isGcloudDeploy(argv: string): boolean {
  const parts = argv.split(/\s+/);
  // gcloud app deploy, gcloud run deploy, gcloud services deploy
  if (parts.length >= 3 && parts[1] === 'app' && parts[2] === 'deploy') return true;
  if (parts.length >= 3 && parts[1] === 'run' && parts[2] === 'deploy') return true;
  if (parts.length >= 3 && parts[1] === 'services' && parts[2] === 'deploy') return true;
  return false;
}

function extractEnvironmentFlag(argv: string): string | null {
  for (const flag of ['--target', '--env', '--environment']) {
    const match = argv.match(new RegExp(`${flag}\\s+(\\S+)`));
    if (match) return match[1];
  }
  return null;
}

function extractTarget(commandName: string, argv: string): string | null {
  const parts = argv.split(/\s+/);
  if (commandName === 'docker') {
    // docker push IMAGE:TAG
    if (parts[1] === 'push' && parts.length >= 3) return parts[2];
  }
  if (commandName === 'aws') {
    // aws deploy push --application-name NAME
    const match = argv.match(/--application-name\s+(\S+)/);
    if (match) return match[1];
  }
  if (commandName === 'helm') {
    // helm upgrade --install RELEASE_NAME ...
    const installIdx = parts.indexOf('--install');
    if (installIdx >= 0 && installIdx + 1 < parts.length) return parts[installIdx + 1];
    // helm upgrade (without --install) — release name is the 3rd token
    if (parts[1] === 'upgrade' && parts.length >= 3 && !parts[2].startsWith('-')) {
      return parts[2];
    }
  }
  return null;
}

function firstToken(input: string): string {
  return input.trim().split(/\s+/)[0] ?? '';
}

function secondToken(input: string): string {
  const parts = input.trim().split(/\s+/);
  return parts[1] ?? '';
}
