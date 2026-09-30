require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    skipLibCheck: true,
  },
});
require('tsconfig-paths/register');
require('./prisma/seed.ts');
