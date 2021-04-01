// NOTE the dev server could (and should) work better ...
// HMR is causing infinite loops
// see the JS console: '<name> has reloaded...' comes again and again
// and cache-busting is not working.

import resolve from "@rollup/plugin-node-resolve";
//import commonjs from "@rollup/plugin-commonjs";
import makeZipFile from "rollup-plugin-zip";
import { terser as minifyJS } from "rollup-plugin-terser";
import { chromeExtension, simpleReloader } from "rollup-plugin-chrome-extension";
import { emptyDir as cleanupBuildDir } from "rollup-plugin-empty-dir";
import babel from '@rollup/plugin-babel';
//import replace from '@rollup/plugin-replace';
import url from '@rollup/plugin-url';
//import static_files from 'rollup-plugin-static-files';
//import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

//import hotcss from 'rollup-plugin-hot-css';
//import css from 'rollup-plugin-css-only';
import autoprefixer from 'autoprefixer';
import postcss from 'rollup-plugin-postcss';
import npmRun from 'npm-run';
import copy from 'rollup-plugin-copy'

const development = (process.env.NODE_ENV == 'development');
const production = !development;

const extensions =  ['.js', '.jsx'];

function serve() {
  let server;
  function toExit() {
    if (server) server.kill(0);
  }
  return {
    writeBundle() {
      console.log('writeBundle');
      if (server) return;
      //server = require('child_process').spawn('npm', ['run', 'serve', '--', '--dev'],
      server = npmRun.spawn( 'sirv', ['dist', '--no-clear'],
        { stdio: ['ignore', 'inherit', 'inherit'], shell: true });
      process.on('SIGTERM', toExit); process.on('exit', toExit);
    }
  };
}

export default {

  input: "src/manifest.json",

  output: { dir: "dist", format: "esm",
    //entryFileNames: '[name].[hash].js',
    //assetFileNames: '[name].[hash][extname]',
  },

  watch: { clearScreen: false },

  plugins: [
    chromeExtension(), // first plugin!
    simpleReloader(),
    //replace({ 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV) }),

    resolve({ extensions, browser: true }), // locate NPM modules
    //babel({ extensions, babelHelpers: 'bundled', ignore: ['content.js', 'src/content.js', '/content.js', '/src/content.js', '*content.js', /.*content\.js/] }), // solidJS
    babel({ extensions, babelHelpers: 'bundled' }), // solidJS
    //commonjs(), // optional

    // TODO bundle.css is missing?
    // support: import styles from "./App.module.css";

    postcss({
      plugins: [autoprefixer()],
      sourceMap: development,
      //extract: true, // [!] (plugin postcss) TypeError: Cannot read property 'importedIds' of null
      minimize: production
    }),


    url(), // needed for: import logo from './logo.svg';

    /*
    copy({
      targets: [
        { src: 'src/index.html', dest: 'dist' },
        //{ src: ['assets/fonts/arial.woff', 'assets/fonts/arial.woff2'], dest: 'dist/public/fonts' },
        //{ src: 'assets/images/**'+'/*', dest: 'dist/public/images' }
      ]
    }),
    */

    cleanupBuildDir(),

    ...(production ? [
      //static_files({ include: ['./public'] }),
      minifyJS({ compress: { global_defs: { module: false } } }),
      makeZipFile({ dir: "release" }),
    ] : []),

    ...(development ? [
      /////////////serve(),
      
      /*
      serve({
        contentBase: './dist',
        port: 4321,
        historyApiFallback: true,
      }),
      */
      //////////livereload('dist'),
      //livereload({ watch: './dist' }),
    ] : []),

  ],
};
