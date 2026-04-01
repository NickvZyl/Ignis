const { existsSync, cpSync, rmSync, renameSync } = require('fs');
const { execSync } = require('child_process');
const { join } = require('path');

const apiDir = join(__dirname, '..', 'app', 'api');
const apiBackup = join(__dirname, '..', '_api_backup');
const middlewareFile = join(__dirname, '..', 'middleware.ts');
const middlewareBackup = join(__dirname, '..', '_middleware_backup.ts');

// Move API routes and middleware out of the way for static export
try {
  if (existsSync(apiDir)) {
    cpSync(apiDir, apiBackup, { recursive: true });
    rmSync(apiDir, { recursive: true, force: true });
  }
  if (existsSync(middlewareFile)) {
    cpSync(middlewareFile, middlewareBackup);
    rmSync(middlewareFile, { force: true });
  }

  console.log('Building static export for mobile...');
  execSync('npx env-cmd -f .env.mobile next build', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, BUILD_MODE: 'mobile' },
  });
} finally {
  // Always restore, even if build fails
  if (existsSync(apiBackup)) {
    if (!existsSync(apiDir)) cpSync(apiBackup, apiDir, { recursive: true });
    rmSync(apiBackup, { recursive: true, force: true });
  }
  if (existsSync(middlewareBackup)) {
    if (!existsSync(middlewareFile)) cpSync(middlewareBackup, middlewareFile);
    rmSync(middlewareBackup, { force: true });
  }
}
