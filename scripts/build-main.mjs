// Rebuild the Electron backend without recopying the unchanged media library.
import {build} from 'vite';
import {builtinModules} from 'node:module';
await build({configFile:false,publicDir:false,build:{outDir:'dist-electron',emptyOutDir:false,minify:'esbuild',
  lib:{entry:'src/main/main.ts',formats:['cjs'],fileName:()=> 'main.js'},
  rollupOptions:{external:id=>id==='electron'||id==='sql.js'||id.startsWith('node:')||builtinModules.includes(id)}}});
