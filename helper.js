/*globals phantom, async, loadInProgress, user, pass*/

var system, webpage, childProcess;

system = require('system');
webpage = require('webpage');
childProcess = require('child_process');

phantom.injectJs('libs/async.js');
phantom.injectJs('libs/underscore.js');
phantom.injectJs('libs/md5.js');

/**
 * Warn on Phantom errors
 * @param msg
 * @param trace
 */
function onPhantomError(msg, trace) {
	var msgStack = ['PHANTOM ERROR: ' + msg];
	if ( trace && trace.length ) {
		trace.forEach(function (t) {
			msgStack.push('  -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function + ')' : ''));
		});
	}
	console.error(msgStack.join('\n'));
	phantom.exit();
}
phantom.onError = onPhantomError;

/**
 * Warn on page errors
 * @param msg
 * @param trace
 */
function onPageError(msg, trace) {
	var msgStack = ['*PAGE ERROR: ' + msg];
	if ( trace && trace.length ) {
		trace.forEach(function (t) {
			msgStack.push('  -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function + ')' : ''));
		});
	}
	console.error(msgStack.join('\n'));
}

/**
 * Output console.log messages in the wild
 * @param msg
 * @param lineNum
 * @param sourceId
 */
function onPageConsoleMessage(msg, lineNum, sourceId) {
	var msgStack = ['*CONSOLE: ' + msg];
	if ( 'undefined' !== typeof lineNum ) {
		msgStack.push('  -> ' + ' (from line #' + lineNum + ' in "' + sourceId + '")');
	}
	console.log(msgStack.join('\n'));
}

/**
 * Warn on resource timeouts
 * @param request
 */
function onPageResourceTimeout(request) {
	console.log('TIMEOUT: Resource #' + request.id + ' to ' + request.url + ' has timed out.');
}

/**
 * Apply timeout timer to stop window scripts and jump to ready state
 */
function onLoadStartedApplyTimeout() {
	page.evaluate(function () {
		var url = window.location.href;
		console.log('-- Loading ' + url);
		setTimeout(window.stop, 10000);
	});
}

/**
 * Get a new Page
 * @returns Phantom::WebPage
 */
function getNewPage() {
	var page = webpage.create();
	page.onError = onPageError;
	//page.onConsoleMessage = onPageConsoleMessage;
	page.onResourceTimeout = onPageResourceTimeout;

	page.viewportSize = {
		width:  1200,
		height: 800
	};

	// Custom user agent
	page.settings.useragent = "Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2049.0 Safari/537.36";

	// Timeout
	page.settings.resourceTimeout = 30000; // 30 seconds
	page.settings.loadImages = false;

	//page.onLoadStarted = onLoadStartedApplyTimeout;

	return page;
}

/**
 * Load a URL and do callback once loaded
 * @param url
 * @param callback
 * @param existingPage
 * @returns Phantom::WebPage
 */
function loadPage(url, callback, existingPage, postData) {
	var page = existingPage || getNewPage();
	var postData = postData || null;
	console.log('-- Loading ' + url);

	var onPageLoad = function (status, skipTimer) {
		var filename = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();

		var wrapUp = function() {
			skipTimer || clearTimeout(timer);
			callback(page);
			if ( !existingPage ) {
				page.close();
			}
		};

		if ( status !== 'success' ) {
			console.log('-- Unable to open url > ' + url);
			wrapUp();
		} else {
			console.log('-- Loaded ' + url);
			// Rendering pages shouldn't be count as a timeout
			clearTimeout(timer);
			skipTimer = true;

			if ( takeShots ) {
				if ( url2png.hasOwnProperty('apiKey') && !/wp-admin/.test(url) ) {
					var shotUrl, hash, args;

					args = '?fullpage=true&viewport=1200x800&unique=' + Date.now() + '&url=' + url;
					hash = CryptoJS.MD5(args + url2png.secretKey);
					shotUrl = 'http://api.url2png.com/v6/' + url2png.apiKey + '/' + hash + '/png/' + args;

					args = [shotUrl, '-O', shotsDir + ( isFrontEnd ? 'front/' : 'back/' ) + filename + '.png'];

					childProcess.execFile('wget', args, null, wrapUp);
				} else {
					setTimeout(function () {
						page.render(shotsDir + ( isFrontEnd ? 'front/' : 'back/' ) + filename + '.jpg', {
							format:  'jpeg',
							quality: '100'
						});
						wrapUp();
					}, 2000);
				}
			} else {
				wrapUp();
			}
		}
	};

	var timer = setTimeout(function () {
		console.log('--* This page is taking too much time!');
		onPageLoad(null, true);
	}, 120000);

	if ( postData ) {
		var _postData = [];
		for ( i in postData ) {
			if ( !postData.hasOwnProperty(i) ) {
				continue;
			}
			_postData.push(i + '=' + postData[i]);
		}
		page.open(url, 'post', _postData.join('&'), onPageLoad);
	} else {
		page.open(url, onPageLoad);
	}
	return page;
}

/**
 * Traverse a list of URLs
 *
 * @param urls
 * @param pageCompleteCallback
 * @param traverseCompleteCallback
 *
 * @return Async::Queue
 */
function traverseURLs(urls, pageCompleteCallback, traverseCompleteCallback) {

	var queue = async.queue(function (url, callback) {
		loadPage(url, function () {
			if ( pageCompleteCallback ) {
				pageCompleteCallback();
			}
			callback();
		});
	}, 1); // number of concurrent jobs

	// Final callback after loading of all urls
	queue.drain = function () {
		console.log('-- Finished loading URLs queue, hit ' + urls.length + ' URLs in the process.');
		if ( traverseCompleteCallback ) {
			traverseCompleteCallback();
		}
	};

	// Remove the trailing # off urls
	urls = _.map(urls, function(url){
		return url.replace(/#.*$/, '');
	});

	urls = _.unique(urls);

	// Filter urls to allow only one url per regex
	var permalinks = {
			author: /\/author\//,
			category: /\/category\//,
			tag: /\/tag\//
		};

	_.each(permalinks, function(permalink){
		var schemeFound = false;
		urls = _.filter(urls, function(url){
			if ( ! permalink.test( url ) ) {
				return true;
			}

			if ( ! schemeFound ) {
				// Allow the first entry only
				schemeFound = true;
				return true;
			} else {
				// Reject any subsequent matches
				return false;
			}
		});
	});

	console.log('-- Hitting ' + urls.length + ' URLs queue');
	console.log(' -* ' + urls.join("\n -* "));

	if ( urls.length <= 1 ) {
		traverseCompleteCallback();
		return queue;
	}

	for ( var i = 0; i < urls.length; i++ ) {
		queue.push(urls[i]);
	}

	return queue;
}

/**
 * Inject jQuery to page object if it does not exist already
 * @param page
 */
function jQueryify(page) {
	if ( page.evaluate(function () {
			return 'undefined' === typeof jQuery;
		}) ) {
		page.injectJs('libs/jquery.js');
	}
}
