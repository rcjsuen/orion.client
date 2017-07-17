/*******************************************************************************
 * @license
 * Copyright (c) 2014, 2017 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License v1.0
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html).
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*eslint-env amd*/
define([
	'orion/plugin',
	'orion/editor/stylers/text_x-dockerfile/syntax',
	'plugins/languages/java/ipc',
	'orion/EventTarget',
	'orion/i18nUtil'
], function(PluginProvider, mDockerfile, IPC, EventTarget, i18nUtil) {

	function connect() {
		var headers = {
			name: "Orion Editor Docker Tool Support",
			version: "1.0",
			description: "This plugin provides Docker tools support for the Orion editor."
		};
		var pluginProvider = new PluginProvider(headers);
		registerServiceProviders(pluginProvider);
		pluginProvider.connect();
	}

	function registerServiceProviders(pluginProvider) {
		pluginProvider.registerServiceProvider("orion.core.contenttype", {}, {
			contentTypes: [
				{	id: "text/x-dockerfile",
					"extends": "text/plain",
					name: "dockerfile",
					extension: ["dockerfile"]
				}
			] 
		});

		mDockerfile.grammars.forEach(function(current) {
			pluginProvider.registerServiceProvider("orion.edit.highlighter", {}, current);
		});

		var ipc = new IPC("/dockerLanguageServer");
		function LSPService() {
			EventTarget.attach(this);
			ipc.lspService = this;
		}
		LSPService.prototype = {
			sendMessage: function(id, message, params) {
				return ipc.sendMessage(id, message, params);
			},
			start: function () {
				return ipc.connect();
			}
		};
		pluginProvider.registerService("orion.languages.server", //$NON-NLS-1$
			new LSPService(),
			{
				languageId: "dockerfile",
				name: "Dockerfile Language Server Support",
				title: "Dockerfile Language Server",
				contentType: ["text/x-dockerfile" ]  //$NON-NLS-1$
			}
		);
	}

	return {
		connect: connect,
		registerServiceProviders: registerServiceProviders
	};
});
