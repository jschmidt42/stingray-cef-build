/**
 * gulp script to download, build and package CEF for the Stingray Editor.
 */

'use strict';

var argv = require('yargs')
    .env('SR_LIB_DIR')
    .options({
        'cef': {
            alias: 'c',
            describe: 'CEF build version to be downloaded, see http://opensource.spotify.com/cefbuilds',
            demand: 'true',
            type: 'string',
            requiresArg: true
        }
    })
    .options({
        'libs': {
            describe: 'Stingray libs destination folder, i.e. %SR_LIB_DIR%',
            demand: 'true',
            type: 'string',
            default: process.env.SR_LIB_DIR,
            requiresArg: true
        }
    })
    .example('gulp --cef <cef build version #>', 'i.e. 3.2924.1564.g0ba0378')
    .argv;

const path = require('path');
const gulp = require('gulp');
const through = require("through");
const gutil = require("gulp-util");
const replace = require('gulp-replace');
const del = require('del');
const request = require("request");
const progress = require("request-progress");
const decompress = require('gulp-decompress');
const vinylAssign = require('vinyl-assign');
const exec = require('child_process').exec;
const mkdirp = require('mkdirp');
const runSequence = require('run-sequence');

const col = gutil.colors;
const outputName = argv.cef.split('.').slice(0, -1).join('.');
const downloadDir = `./builds/${outputName}`;
const buildDir = `${downloadDir}/build`;
const buildWrapperDir = path.join(buildDir, 'libcef_dll_wrapper');
const packageDir = `${argv.libs}/cef-${outputName}-win64-vc14`;
const packageX64Dir = path.join(packageDir, 'x64');
const downloadUrl = `http://opensource.spotify.com/cefbuilds/cef_binary_${argv.cef}_windows64.tar.bz2`;

/**
 * Download a set of URLs
 * @param {string[]} urls
 */
const download = function(urls) {

    let stream = through(function (file, enc, cb) {
        this.push(file);
        cb();
    });

    var files = typeof urls === 'string' ? [urls] : urls;
    var downloadCount = 0;

    function download(url) {
        //noinspection JSUnusedLocalSymbols
        function downloadHandler(err, res, body){
            var fileName = url.split('/').pop();
            var file = new gutil.File( {path:fileName, contents: new Buffer(body)} );
            stream.queue(file);

            process.stdout.write('\r['+col.green('gulp')+']'+' Downloading '+col.cyan(url)+'... 100% '+col.green('Done\r\n'));
            downloadCount++;
            if(downloadCount !== files.length) {
                download(files[downloadCount]);
            } else {
                stream.emit('end');
            }
        }

        progress(
            request({url:url,encoding:null},downloadHandler),
            {throttle:1000,delay:1000}
        )
        .on('progress',function(state){
            process.stdout.write('\r['+col.green('gulp')+']'+' Downloading '+col.cyan(url)+'... ');
            process.stdout.write(+(state.percent*100).toFixed(0)+'%');
        });
    }

    download(files[0]);

    return stream;
};

/**
 * Build CMake solutions
 * @param {string} config - MSVC build type (i.e. Debug, Release, etc.)
 * @returns {Promise}
 */
const cmakeBuild = function(config) {
    return new Promise((resolve, reject) => {
        let cmake = exec(`cmake --build . --target libcef_dll_wrapper --config ${config}`, {
            cwd: buildDir
        }, (err) => {
            if (err)
                return reject(err);
            resolve();
        });

        cmake.stdout.pipe(process.stdout);
        cmake.stderr.pipe(process.stderr);
    });
};

/**
 * Print debugging infos.
 */
gulp.task('print', function() {
    console.info('Download URL:', downloadUrl);
    console.info('CEF Version:', outputName);
    console.info('CEF dir:', path.resolve(downloadDir));
    console.info('Build dir:', path.resolve(buildDir));
    console.info('Package dir:', path.resolve(packageDir));
    console.dir(argv);
});

/**
 * Download CEF binaries and lib wrapper source.
 */
gulp.task('download', function() {
    return download(downloadUrl)
        .on('end', () => process.stdout.write('['+col.green('gulp')+']'+' Unzipping '+'... '))
        .pipe(vinylAssign({extract: true}))
        .pipe(decompress({strip: 1}))
        .on('end', () => process.stdout.write('\r['+col.green('gulp')+']'+' Unzipping '+'... '+ col.green('Done\r\n')))
        .pipe(gulp.dest(downloadDir));
});

/**
 * Clean CMake outputs
 */
gulp.task('clean_build', () => Promise.resolve()
    .then(() => del(buildDir))
    .then(() => del(packageDir, {force: true})));

/**
 * Create build directories for CMake
 */
gulp.task('mkdir', ['clean_build'], () => new Promise((resolve) => mkdirp(buildDir, resolve)));

/**
 * Generate CEF CMake solutions.
 */
gulp.task('generate', ['mkdir'], function () {
    return new Promise((resolve, reject) => {
        gulp.src(['**/*.cmake'], {base: downloadDir})
            .pipe(replace(/\/MT/g, '/MD'))
            .pipe(gulp.dest(`${downloadDir}`))
            .on('end', function () {

                let cmake = exec(`cmake -G "Visual Studio 14 Win64" .. -DUSE_SANDBOX=OFF`, {
                    cwd: buildDir
                }, err => {
                    if (err)
                        return reject(err);
                    resolve();
                });

                cmake.stdout.pipe(process.stdout);
                cmake.stderr.pipe(process.stderr);
            });
        });
});

/**
 * Compile CEF CMake solutions.
 */
gulp.task('compile', ['generate'], function () {
    return Promise.all([
        cmakeBuild('Debug'),
        cmakeBuild('Release'),
    ]);
});

/**
 * Package base CEF files.
 */
gulp.task('package:base', () => gulp
    .src([
        path.join(downloadDir, 'LICENSE.txt'),
        path.join(downloadDir, 'README.txt'),
        path.join(downloadDir, 'include/**'),
        path.join(downloadDir, 'Resources/**')
    ], {base: downloadDir})
    .pipe(gulp.dest(packageDir)));

/**
 * Create Stingray/CEF required directories in the package dir.
 */
gulp.task('package:mkdir', () => new Promise((resolve) => mkdirp(packageX64Dir, resolve)));

/**
 * Package pre-compiled CEF binaries.
 */
gulp.task('package:bin', ['package:mkdir'], () => gulp
    .src([
        path.join(downloadDir, 'Debug/**'),
        path.join(downloadDir, 'Release/**')
    ], {base: downloadDir})
    .pipe(gulp.dest(packageX64Dir)));

/**
 * Package CEF built outputs.
 */
gulp.task('package:bin_wrapper', ['package:mkdir'], () => gulp
    .src([
        path.join(buildWrapperDir, 'Debug/**'),
        path.join(buildWrapperDir, 'Release/**')
    ], {base: buildWrapperDir})
    .pipe(gulp.dest(packageX64Dir)));

/**
 * Re-organized a few CEF files required for Stingray.
 */
gulp.task('package:other', ['package:mkdir'], () => gulp
    .src([
        path.join(downloadDir, 'Resources', 'icudtl.dat')
    ], {base: path.join(downloadDir, 'Resources')})
    .pipe(gulp.dest(path.join(packageX64Dir, 'Debug')))
    .pipe(gulp.dest(path.join(packageX64Dir, 'Release'))));

/**
 * Compile package task.
 */
gulp.task('package', ['package:base', 'package:bin', 'package:bin_wrapper', 'package:other'], () => {});

/**
 * Generate, compile and package CEF for Stingray.
 */
gulp.task('build', function (done) {
    runSequence('download', 'compile', 'package', done);
});

/**
 * Default build task.
 */
gulp.task('default', ['build']);
