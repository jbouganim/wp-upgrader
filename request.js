/*global phantom*/
phantom.injectJs('helper.js');

var page, startURL, shotsDir, user, pass;

if ( system.args.length === 1 ) {
	console.log('Usage: request.js shots-directory <some URL> user pass');
	phantom.exit();
}

startURL = system.args[1];
shotsDir = system.args[2];

if ( system.args.length === 5 ) {
	user = system.args[3];
	pass = system.args[4];
}

async.series([

	// 1. Load the start page
	function(callback) {
		console.log('-> # Load start page');
		page = loadPage(startURL, function(){
			callback();
		}, getNewPage());
	},

	// Database upgrade page check
	function(callback) {
		jQueryify(page);

		var isUpdate;

		isUpdate = page.evaluate(function(){
			return /wp-admin\/upgrade.php/.test(window.location.href);
		});

		if ( ! isUpdate ) {
			callback();
			return;
		}

		console.log('-> # Found DB Update form, submitting');

		// End only on redirection finished
		page.onLoadFinished = function() {
			page.onLoadFinished = function() {
				callback();
			};

			jQueryify(page);
			page.evaluate(function(){
				jQuery('.button-large').click(); // the 'Continue' button
			});
		};

		page.evaluate(function(){
			jQuery('.button-large').click(); // Click the Update WordPress Database button
		});
	},

	// 2. Check for a login form, adding user/pass and submitting form if found
	function(callback) {
		jQueryify(page);

		var isLogin = page.evaluate(function(){
			//return jQuery('body.login.login-action-login.wp-core-ui #loginform').length !== 0;
			return jQuery('#loginform').length !== 0;
		});
		// Skip if not a login page, so we're probably on the front-end
		if ( ! isLogin ) {
			callback();
			return;
		}

		console.log('-> # Found login form, logging in');

		// End only on redirection finished
		page.onLoadFinished = function() {
			callback();
		};

		// Submit the form
		page.evaluate(function (user, pass) {
			jQuery('#user_login').val(user);
			jQuery('#user_pass').val(pass);
			jQuery('#loginform').submit();
		}, user, pass);

	},

	// 3. Get list of links on page and traverse them
	function (callback) {
		console.log('-> # Traversing links');

		// Just in case
		jQueryify(page);

		// Get list of menu items to traverse
		var urls = page.evaluate(function (startURL) {
			var isAdmin, linksContainer;

			// Check if we're on an admin page
			isAdmin = jQuery('body').hasClass('wp-admin');

			// Only traverse admin menu if on admin pages
			linksContainer = isAdmin ? '#adminmenu' : 'body';

			// Get URLs to traverse
			return jQuery('a[href]', linksContainer)
				.filter(function(i, el){
					if ( el.href.indexOf(startURL) === -1 ) {
						return false;
					}
					return true;
				})
				.map(function (i, el) {
					return el.href;
				}).toArray();
		}, startURL);

		traverseURLs(urls, null, function(){
			phantom.exit();
		});
		callback();
	}
]);

