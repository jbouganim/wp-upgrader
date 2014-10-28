/*globals phantom, async, loadInProgress, user, pass*/

var system, webpage;

system = require('system');
webpage = require('webpage');

phantom.injectJs('libs/async.js');
phantom.injectJs('libs/underscore.js');

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
function onLoadStartedApplyTimeout(){
	page.evaluate(function(){
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
	//page.settings.useragent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_0) AppleWebKit/537.1 (KHTML, like Gecko) Chrome/21.0.1180.79 Safari/537.1";

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
function loadPage(url, callback, existingPage) {
    var page = existingPage || getNewPage();
    console.log('-- Loading ' + url);

    page.open(url, function (status) {
        var filename = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        page.render( shotsDir + filename + '.jpg', {
            format:  'jpeg',
            quality: '100'
        });

        if ( status !== 'success' ) {
            console.log('-- Unable to open url > ' + url);
        } else {
            console.log('-- Loaded ' + url);
        }
        if ( !existingPage ) {
            page.close();
        }
        callback();
    });
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
	console.log('-- Hitting '+ urls.length +' URLs queue');
	var queue = async.queue(function (url, callback) {
        loadPage(url, function(){
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

	urls = _.unique(urls);

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
    if ( page.evaluate(function(){ return 'undefined' === typeof jQuery; }) ) {
        page.injectJs('libs/jquery.js');
    }
}