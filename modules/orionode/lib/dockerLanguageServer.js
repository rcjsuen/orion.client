/*******************************************************************************
 * Copyright (c) 2016, 2017 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*eslint-env node*/
/*eslint-disable no-sync*/
var path = require('path');
var cp = require('child_process');
var api = require('./api');
var net = require('net');
var fs = require('fs');
var fileUtil = require('./fileUtil');

var log4js = require('log4js');
var logger = log4js.getLogger("lsp");

var IN_PORT = 8123;
var OUT_PORT = 8124;

var lspProcess = null;

function fork(modulePath, args, options, callback) {
	var callbackCalled = false;
	var resolve = function(result) {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(null, result);
	};
	var reject = function(err) {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(err, null);
	};

	var childProcess = cp.fork(modulePath, args);
	childProcess.once('error', function(err) {
		logger.error("Java process error event");
		logger.error(err);
		reject(err);
	});
	childProcess.once('exit', function(err, signal) {
		logger.error("Java process exit event");
		logger.error(err);
		reject(err);
	});
	resolve(childProcess);
	lspProcess = childProcess;
}

var DEBUG = true;

function runLanguageServer() {
	return new Promise(function(resolve, reject) {
		var child = path.resolve(__dirname, "../node_modules/dockerfile-language-server-nodejs/lib/server.js");
		var params = [];
		params.push("--inspect=9222");
		params.push("--node-ipc");
		return fork(child, params, {}, function(err, result) {
			if (err) reject(err);
			if (result) resolve(result);
		});
	});
}

function fixURI(p, workspaceUrl) {
	if (Array.isArray(p)) {
		p.forEach(function(element) {
			fixURI(element, workspaceUrl);
		});
	}
	if (p.uri) {
		var s = p.uri.slice(workspaceUrl.length);
		p.uri = api.join('/file/orionode', s.charAt(0) === '/' ? s.slice(1) : s);
	}
}

exports.install = function(options) {
	var io = options.io;
	if (!io) {
		logger.error('Missing options.io. LSP features will be disabled.');
		return;
	}
	var workspaceUrl = "file:///" + options.workspaceDir.replace(/\\/g, "/");

	io.of('/dockerLanguageServer').on('connection', function(sock) {
	console.log("Here?");
		sock.on('start', /* @callback */ function(cwd) {
			var startup = true;
			sock.on('data', function(data) {
				var textDocument = data.params && data.params.textDocument;
				if (textDocument && textDocument.uri) {
					var workspaceFile = fileUtil.getFile2(options.metastore, textDocument.uri.replace(/^\/file/, ''));
					textDocument.uri = workspaceUrl + workspaceFile.path.slice(workspaceFile.workspaceDir.length);
					// convert backslashes to slashes only if on Windows
					if (path.sep === '\\') {
						textDocument.uri = textDocument.uri.replace(/\\/g, "/");
					}
				}
				var s = JSON.stringify(data);
				logger.info('data sent\t: ' + s);
				console.log(s);
				lspProcess.send(data);
			});
			var serverClosed = false;
			var closeServer = function () {
				if (serverClosed) {
					return;
				}
				serverClosed = true;
				lspProcess.kill();
			};
			runLanguageServer().then(function(child) {
				if (sock && startup) {
					startup = false;
					sock.emit('ready',
						JSON.stringify({
							workspaceDir: options.workspaceDir,
							processId: process.pid
						}));
				}

				lspProcess.on('message', function(json) {
					if (json) {
						if (json.params) {
							fixURI(json.params, workspaceUrl);
						}
						if (json.result) {
							fixURI(json.result, workspaceUrl);
						}
					}
					if (json !== null && sock) {
						logger.info("data received:\t" + JSON.stringify(json));
						sock.emit('data', json);
					}
				});
				child.on('error', function(err) {
					closeServer();
					logger.error('java server process error: ' + err.toString());
				});
				child.once('error', function(err) {
					closeServer();
					logger.error(err);
				});
				child.once('exit', function() {
					closeServer();
				});
				sock.on('disconnect', function() {
					if (child.connected) {
						child.disconnect();
					} else {
						child.kill();
					}
					sock = null;
				});
			});
		});
	});
};

exports.uninstall = function() {};