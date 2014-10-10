/*global phantom*/
var page = require('webpage').create(),
    system = require('system'),
    t, address;

if (system.args.length === 1) {
    console.log('Usage: request.js <some URL>');
    phantom.exit();
}

// Custom user agent
//page.settings.useragent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_0) AppleWebKit/537.1 (KHTML, like Gecko) Chrome/21.0.1180.79 Safari/537.1";

// Timeout
//page.settings.resourceTimeout = 5000; // 5 seconds

t = Date.now();
address = system.args[1];
console.log('Hitting ' + address);

// @todo Outputs to stdin, which should be collected and logged to a file
phantom.onError = function(msg, trace) {
    var msgStack = ['PHANTOM ERROR: ' + msg];
    if (trace && trace.length) {
        msgStack.push('TRACE:');
        trace.forEach(function(t) {
            msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function +')' : ''));
        });
    }
    console.error(msgStack.join('\n'));
    phantom.exit();
};

// Tracking pending requests
//var requests = {};
//page.onResourceRequested = function (request) {
//    requests[request.id] = request.url;
//};
//page.onResourceReceived = function (response) {
//    delete requests[response.id];
//    //console.log( 'Loaded ' + response.id, JSON.stringify( requests ) );
//};

page.onResourceTimeout = function(request) {
    console.log('Request #' + request.id + ' to ' + request.url + ' has timed out.');
};

page.open(address, function(status) {
    if (status !== 'success') {
        console.log('FAIL to load the address');
    }
    else {
        t = Date.now() - t;
        console.log('Loading time ' + t + ' msec');
    }
    phantom.exit();
});