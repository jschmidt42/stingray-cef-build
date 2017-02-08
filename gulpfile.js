/**
 * gulp script to download, build and package CEF for the Stingray Editor.
 */

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
const vinylPaths = require('vinyl-paths');
const vinylAssign = require('vinyl-assign');
const exec = require('child_process').exec;
const mkdirp = require('mkdirp');

const col = gutil.colors;
const outputName = argv.cef.split('.').slice(0, -1).join('.');
const outputDir = `./builds/${outputName}`;
const buildDir = `${outputDir}/build`;
const packageDir = `${argv.libs}/cef-${outputName}-win64-vc-14`;
const downloadUrl = `http://opensource.spotify.com/cefbuilds/cef_binary_${argv.build}_windows64.tar.bz2`;

const download = function(urls){
	var stream = through(function(file,enc,cb) {
		this.push(file);
		cb();
	});

	var files = typeof urls === 'string' ? [urls] : urls;
	var downloadCount = 0;

	function download(url) {
		var firstLog = true;

		progress(
			request({url:url,encoding:null},downloadHandler),
			{throttle:1000,delay:1000}
		)
		.on('progress',function(state){
			process.stdout.write('\r['+col.green('gulp')+']'+' Downloading '+col.cyan(url)+'... ');
			process.stdout.write(+(state.percent*100).toFixed(0)+'%')
		});

		function downloadHandler(err, res, body){
			var fileName = url.split('/').pop();
			var file = new gutil.File( {path:fileName, contents: new Buffer(body)} );
			stream.queue(file);

			process.stdout.write('\r['+col.green('gulp')+']'+' Downloading '+col.cyan(url)+'... 100% '+col.green('Done\r\n'));
			downloadCount++;
			if(downloadCount != files.length){
				download(files[downloadCount])
			} else {
				stream.emit('end');
			}
		}
	}

	download(files[0]);

	return stream;
};

gulp.task('print', function() {
	console.info('Download URL:', downloadUrl);
	console.info('Output name:', outputName);
	console.info('Output dir:', path.resolve(outputDir));
	console.info('Build dir:', path.resolve(buildDir));
	console.info('Package dir:', path.resolve(packageDir));
	console.dir(argv);
});

gulp.task('download', function() {
	return download(downloadUrl)
		.on('end', () => process.stdout.write('['+col.green('gulp')+']'+' Unzipping '+'... '))
		//.pipe(vinylAssign({extract: true}))
		.pipe(decompress({strip: 1}))
		.on('end', () => process.stdout.write('\r['+col.green('gulp')+']'+' Unzipping '+'... '+ col.green('Done\r\n')))
        .pipe(gulp.dest(outputDir));
});

gulp.task('clean_build', function () {
	return Promise.resolve()
		.then(() => del(buildDir))
		.then(() => del(packageDir))
});

gulp.task('mkdir', ['clean_build'], function () {
	return new Promise((resolve) => mkdirp(buildDir, resolve));
});

gulp.task('generate', ['mkdir'], function () {
	return new Promise((resolve) => {
		gulp.src(['**/*.cmake'], {base: outputDir})
    		.pipe(replace(/\/MT/g, '/MD'))
    		.pipe(gulp.dest(`${outputDir}`))
    		.on('end', function () {

				let cmake = exec(`cmake -G "Visual Studio 14 Win64" .. -DUSE_SANDBOX=OFF`, {
					cwd: buildDir
				}, function (error, stdout, stderr) {
					resolve();
				});

				cmake.stdout.pipe(process.stdout);
				cmake.stderr.pipe(process.stderr);
			});
		});
});

gulp.task('build', ['generate'], function () {
	return new Promise((resolve) => {
		let cmake = exec(`cmake --build . --target libcef_dll_wrapper --config Release`, {
			cwd: buildDir
		}, resolve);

		cmake.stdout.pipe(process.stdout);
		cmake.stderr.pipe(process.stderr);
	});
});

gulp.task('default', ['download', 'build']);
