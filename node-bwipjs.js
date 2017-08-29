// file: node-bwipjs.js
//
// Copyright (c) 2011-2016 Mark Warren
//
// See the LICENSE file in the bwip-js root directory
// for the extended copyright notice.
//
var url	= require('url'),
	bwipp = require(__dirname + '/bwipp'),
	bwipjs = require(__dirname + '/bwipjs'),
	Bitmap = require(__dirname + '/node-bitmap'),
	// freetype = require(__dirname + '/freetype')
	;

// This module's primary export is the bwip-js HTTP request handler
module.exports = function(req, res, opts) {
	var args = url.parse(req.url, true).query;

	// Convert boolean empty parameters to true
	for (var id in args) {
		if (args[id] === '')
			args[id] = true;
	}
	// Add in server options/overrides
	opts = opts || {};
	for (var id in opts) {
		args[id] = opts[id];
	}

	module.exports.toBuffer(args, function(err, png) {
		if (err) {
			res.writeHead(400, { 'Content-Type':'text/plain' });
			res.end(err, 'ascii');
		} else {
			res.writeHead(200, { 'Content-Type':'image/png' });
			res.end(png, 'binary');
		}
	});
}

//
// bwipjs.toBuffer(options, callback)
//
// Generates a PNG-encoded image in a buffer.
//
// `options` are the bwip-js/BWIPP options wrapped in an object.
// `callback` is an event handler with prototype:
//
// 		function callback(err, png)
//
// 		`err` is an Error object or string.  If `err` is set, `png` is null.
// 		`png` is a node Buffer containing the PNG image.
//
module.exports.toBuffer = function(args, callback) {
	// Set the defaults
	var scale	= args.scale || 2;
	var scaleX	= +args.scaleX || scale;
	var scaleY	= +args.scaleY || scaleX;
	var rot		= args.rotate || 'N';
	var mono	= args.monochrome || false;
	var padX	= +args.paddingwidth || 0;
	var padY	= +args.paddingheight || 0;

	// The required parameters
	var bcid	= args.bcid;
	var text	= args.text;

	if (!text) {
		return callback('Bar code text not specified.');
	}
	if (!bcid) {
		return callback('Bar code type not specified.');
	}
	// Remove the non-BWIPP options
	delete args.scale;
	delete args.scaleX;
	delete args.scaleY;
	delete args.rotate;
	delete args.text;
	delete args.bcid;
	delete args.monochrome;
	delete args.paddingwidth;
	delete args.paddingheight;

	// Initialize a barcode writer object.  This is the interface between
	// the low-level BWIPP code, freetype, and the Bitmap object.
	var bw = new bwipjs(freetype, mono);

	// Set the options
	var opts = {};
	for (var id in args) {
		opts[id] = args[id];
	}
	// Fix a disconnect in the BWIPP rendering logic
	if (opts.alttext) {
		opts.includetext = true;
	}
	// We use mm rather than inches for height - except pharmacode2 height
	// which is expected to be in mm
	if (+opts.height && bcid != 'pharmacode2') {
		opts.height = opts.height / 25.4 || 0.5;
	}
	// Likewise, width
	if (+opts.width) {
		opts.width = opts.width / 25.4 || 0;
	}

	// Override the `backgroundcolor` option.
	if (opts.backgroundcolor) {
		bw.bitmap(new Bitmap(rot, parseInt(''+opts.backgroundcolor, 16)));
		delete opts.backgroundcolor;
	} else {
		bw.bitmap(new Bitmap(rot));
	}

	// Add optional padding and scale the image.
	bw.bitmap().pad(padX*scaleX || 0, padY*scaleY || 0);
	bw.scale(scaleX, scaleY);

	// Call into the BWIPP cross-compiled code
	try {
		var ts0 = Date.now();
		bwipp()(bw, bcid, text, opts);
		var ts1 = Date.now();
		bw.bitmap().render(callback);
	} catch (e) {
		// Invoking this callback is synchronous.
		callback('' + e);
	}
	var ts2 = Date.now();
	//console.log('Encoded in: ' + (ts1-ts0) + ' msecs');
	//console.log('Rendered in: ' + (ts2-ts1) + ' msecs');
	//console.log('Elapsed: ' + (ts2-ts0) + ' msecs');
}

module.exports.loadFont = function(fontname, sizemult, fontfile) {
	freetype.FS_createDataFile('/', fontname, fontfile, true, false);

	var load_font = freetype.cwrap("load_font", 'number',
										['string','string','number']);
	var rv = load_font('/' + fontname, fontname, sizemult);
	if (rv != 0) {
		freetype.unlink('/' + fontname);
		throw 'Error: font load failed [' + rv + ']';
	}
}

module.exports.unloadFont = function(fontname) {
	// Unload from freetype
	var close_font = freetype.cwrap("close_font", 'number', ['string']);
	close_font(fontname);

	// Delete from emscripten
	freetype.unlink('/' + fontname);
}

module.exports.bwipjs_version = "1.4.2 (2017-07-13)";
module.exports.bwipp_version = "2017-06-09";
