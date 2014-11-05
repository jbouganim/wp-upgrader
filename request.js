/*global phantom*/
phantom.injectJs('helper.js');

var page, startURL, shotsDir, user, pass, url2png, isFrontEnd = true, takeShots, doEnv;

if ( system.args.length === 1 ) {
	console.log('Usage: request.js shots-directory <some URL> user pass');
	phantom.exit();
}

startURL = system.args[1];
takeShots = system.args[2];
shotsDir = system.args[3];
doEnv = system.args[4];

if ( system.args.length > 4 ) {
	user = system.args[5];
	pass = system.args[6];
}

try {
	url2png = require('./url2png.json');
} catch ( e ) {
	url2png = {};
}

var steps = {
	front:    function (callback) {
		console.log('-> # Load homepage');
		page = loadPage(startURL, function () {
			callback();
		});
	},
	back:     function (callback) {
		isFrontEnd = false;
		console.log('-> # Load login page');

		page = loadPage(
			startURL + 'wp-login.php',
			function (page) {
				callback();
			},
			null,
			{
				log:        user,
				pwd:        pass,
				rememberme: 'forever',
				redirect_to: startURL + 'wp-admin/'
			}
		);
	},
	traverse: function (callback) {
		console.log('-> # Traversing links');

		// Just in case
		jQueryify(page);

		// Get list of menu items to traverse
		var urls = page.evaluate(function (startURL) {
			var isAdmin, linksContainer, logoutURL, urls;

			// Check if we're on an admin page
			isAdmin = jQuery('body').hasClass('wp-admin');

			// Only traverse admin menu if on admin pages
			linksContainer = isAdmin ? '#adminmenu' : 'body';

			// Get URLs to traverse
			urls = jQuery('a[href]', linksContainer)
				.filter(function (i, el) {
					return el.href.indexOf(startURL) !== -1;
				})
				.map(function (i, el) {
					return el.href;
				}).toArray();

			if ( isAdmin ) {
				logoutURL = startURL.replace(/wp-admin\/?/, '') + '/wp-login.php?loggedout=true';
				urls.push(logoutURL);
			}

			return urls;
		}, startURL);

		traverseURLs(urls, null, function () {
			callback();
		});
	},
	exit:     function (callback) {
		phantom.exit();
		callback();
	}
};

var executeSteps = [];
if ( doEnv != 2 ) {
	executeSteps.push(steps.front);
	executeSteps.push(steps.traverse);
}
if ( doEnv > 1 ) {
	executeSteps.push(steps.back);
	executeSteps.push(steps.traverse);
}
executeSteps.push(steps.exit);

async.series(executeSteps);

