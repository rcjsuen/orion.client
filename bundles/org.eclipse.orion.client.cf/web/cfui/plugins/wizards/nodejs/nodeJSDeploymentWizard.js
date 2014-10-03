/*******************************************************************************
 * @license
 * Copyright (c) 2014 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/
/*global parent window document define orion setTimeout*/

define(["orion/bootstrap", 'orion/Deferred', 'orion/selection', 'orion/cfui/cFClient', 'orion/PageUtil', 'orion/PageLinks', 'orion/preferences', 'orion/fileClient', 'cfui/cfUtil', 'cfui/plugins/wizards/common/errorUtils', 'orion/i18nUtil',
	'orion/webui/Wizard', 'cfui/plugins/wizards/common/deploymentLogic', 'cfui/plugins/wizards/common/commonPaneBuilder', 'cfui/plugins/wizards/common/corePageBuilder', 
	'cfui/plugins/wizards/common/servicesPageBuilder', 'cfui/plugins/wizards/common/additionalParamPageBuilder'], 
		function(mBootstrap, Deferred, mSelection, CFClient, PageUtil, PageLinks, Preferences, mFileClient, mCfUtil, mErrorUtils, i18nUtil, Wizard,
				mDeploymentLogic, mCommonPaneBuilder, mCorePageBuilder, mServicesPageBuilder, mAdditionalParamPageBuilder) {
	
	/* plugin-host communication */
	var postMsg = mCfUtil.defaultPostMsg;
	var postError = mCfUtil.defaultPostError;
	var closeFrame = mCfUtil.defaultCloseFrame;
	
	/* status messages */
	var showMessage = mErrorUtils.defaultShowMessage;
	var hideMessage = mErrorUtils.defaultHideMessage;
	var showError = mErrorUtils.defaultShowError;
	
	function _getDefaultTarget(fileClient, resource) {
		var clientDeferred = new Deferred();
		fileClient.read(resource.ContentLocation, true).then(
			function(result){
				mCfUtil.getDefaultTarget(result).then(
					clientDeferred.resolve,
					clientDeferred.reject
				);
			}, clientDeferred.reject
		);
		
		return clientDeferred;
	}
	
	mBootstrap.startup().then(function(core) {
		
		/* set up initial message */
		document.getElementById('title').appendChild(document.createTextNode("Configure Application Deployment")); //$NON-NLS-1$//$NON-NLS-0$
		
		/* allow the frame to be closed */
		document.getElementById('closeDialog').addEventListener('click', closeFrame); //$NON-NLS-1$ //$NON-NLS-0$
		 
		/* allow frame to be dragged by title bar */
		var that = this;
		var iframe = window.frameElement;
	    setTimeout(function(){
	    	
			var titleBar = document.getElementById('titleBar');
			titleBar.addEventListener('mousedown', function(e) {
				that._dragging = true;
				if (titleBar.setCapture) {
					titleBar.setCapture();
				}
				
				that.start = {
					screenX: e.screenX,
					screenY: e.screenY
				};
			});
			
			titleBar.addEventListener('mousemove', function(e) {
				if (that._dragging) {
					var dx = e.screenX - that.start.screenX;
					var dy = e.screenY - that.start.screenY;
					
					that.start.screenX = e.screenX;
					that.start.screenY = e.screenY;
					
					var x = parseInt(iframe.style.left) + dx;
					var y = parseInt(iframe.style.top) + dy;
					
					iframe.style.left = x+"px";
					iframe.style.top = y+"px";
				}
			});
			
			titleBar.addEventListener('mouseup', function(e) {
				that._dragging = false;
				if (titleBar.releaseCapture) {
					titleBar.releaseCapture();
				}
			});
	    });
			
		var pageParams = PageUtil.matchResourceParameters();
		var resourceString = decodeURIComponent(pageParams.resource);
		var resource = JSON.parse(resourceString);
			
		var serviceRegistry = core.serviceRegistry;
		var cfService = new CFClient.CFService(serviceRegistry);
			
		/* compute relative content location */
		var relativeFilePath = new URL(resource.ContentLocation).href;
		var orionHomeUrl = new URL(PageLinks.getOrionHome());
			
		if(relativeFilePath.indexOf(orionHomeUrl.origin) === 0)
			relativeFilePath = relativeFilePath.substring(orionHomeUrl.origin.length);
			
		if(relativeFilePath.indexOf(orionHomeUrl.pathname) === 0)
			relativeFilePath = relativeFilePath.substring(orionHomeUrl.pathname.length);
			
		var preferences = new Preferences.PreferencesService(serviceRegistry);
		var fileClient = new mFileClient.FileClient(serviceRegistry);
		
		/* built-in wizard error handler */
		var handleError = mCfUtil.buildDefaultErrorHandler({
			cFService : cfService,
			showMessage : showMessage,
			hideMessage : hideMessage,
			showError : showError,
			render : function(fields){
				document.getElementById('messageText').appendChild(fields);
			}
		});
		
		/* deployment plan */
		var plan = resource.Plan;
		var manifestApplication = plan.Manifest.applications[0];
		
		Deferred.all([
		 		     
		     mCfUtil.getTargets(preferences),
		 	 _getDefaultTarget(fileClient, resource)
		 		     
		]).then(function(results){
			
			var clouds = results[0];
			var defaultTarget = results[1];
			
			/* welcome page */
			var defaultSelection;
			var page0 = new Wizard.WizardPage({
		    	template: "<div class=\"deployMessage\" id=\"planMessage\"></div>",
		    	
		    	render: function(){
		    		this.wizard.validate();
		    		var target = clouds[0];
		    		
		    		showMessage("Loading deployment configuration...");
		    		cfService.getOrgs(target).then(function(resp){
		    			hideMessage();
		    			
		    			var org = resp.Orgs[0];
		    			var space = org.Spaces[0];
		    			
		    			target.Org = org.Name;
		    			target.Space = space.Name;
		    			
		    			defaultSelection = new mSelection.Selection(serviceRegistry, "orion.Spaces.selection"); //$NON-NLS-0$
		    			defaultSelection.setSelections(target);
		    			
		    			var messageTemplate = "<b>${0}</b> is going to be deployed as a <b>node.js</b> application to <b>${1}</b> @ <b>${2}</b> "+
		    				"using target <b>${3}</b>. Click \"Deploy\" to proceed or \"Next\" to change the deployment parameters.";
		    			
		    			var message = i18nUtil.formatMessage(messageTemplate, manifestApplication.name,
		    					space.Name, org.Name, defaultTarget.Name || defaultTarget.Url || target.Name || target.Url);
		    			
		    			var messageDiv = document.getElementById("planMessage");
			    		messageDiv.innerHTML = message;
			    		
		    		}, function(error){
		    			handleError(error, target, function(){ return page0.render(); });
		    		});
		    	},
		    	
		    	validate: function(setValid){
		    		setValid(true);
		    		return;
		    	},
		    	
		    	getResults: function(){
		    		return {};
		    	}
		    });
			
			/* init common pane builder */
			var commonPaneBuilder = new mCommonPaneBuilder.CommonPaneBuilder({
		    	AppPath : resource.AppPath /* relative application path */
		    });
			
			/* init core page builder */
		    var corePageBuilder = new mCorePageBuilder.CorePageBuilder({
		    	Clouds : clouds,
		    	DefaultTarget : defaultTarget,
		    	
		    	ManifestApplication : manifestApplication,
		    	serviceRegistry : serviceRegistry,
		    	CFService : cfService,
		    	
		    	showMessage : showMessage,
		    	hideMessage : hideMessage,
		    	handleError : handleError,
		    	postError : postError
		    });
			
		    /* init services page builder */
		    var servicesPageBuilder = new mServicesPageBuilder.ServicesPageBuilder({
		    	ManifestServices : manifestApplication.services,
		    	
		    	CFService : cfService,
		    	getTargetSelection : function(){
		    		return corePageBuilder.getSelection();
		    	},
		    	
		    	showMessage : showMessage,
		    	hideMessage : hideMessage,
		    	handleError : handleError,
		    	postError : postError
		    });
		    
		    /* init additional parameters page builder */
		    var additionalParamPageBuilder = new mAdditionalParamPageBuilder.AdditionalParamPageBuilder({
		    	ManifestApplication : manifestApplication
		    });
		    
		    /* build pages */
		    var commonPane = commonPaneBuilder.build();
		    var page1 = corePageBuilder.build();
		    var page2 = servicesPageBuilder.build();
		    var page3 = additionalParamPageBuilder.build();
		    
			var wizard = new Wizard.Wizard({
				parent: "wizard",
				pages: [page0, page1, page2, page3],
				commonPane: commonPane,
				onCancel: closeFrame,
				buttonNames: { ok: "Deploy" },
				size: { width: "420px", height: "180px" },
				onSubmit: mDeploymentLogic.buildDeploymentTrigger({
					
					showMessage : showMessage,
					closeFrame : closeFrame,
					disableUI : function(){
						if(corePageBuilder._orgsDropdown)
							corePageBuilder._orgsDropdown.disabled = true;
						
						if(corePageBuilder._spacesDropdown)
							corePageBuilder._spacesDropdown.disabled = true;
					},
					
					postMsg : postMsg,
					postError : postError,
					
					CFService : cfService,
					getTargetSelection : function(){
						
						var selection = corePageBuilder.getSelection();
						if(typeof selection === "undefined" && defaultSelection)
							return defaultSelection;
						
			    		return selection;
			    	},
			    	
			    	saveManifest : function(){
			    		var checkbox = commonPaneBuilder._saveManifestCheckbox;
			    		return checkbox ? checkbox.checked : false;
			    	},
			    	
			    	Manifest : plan.Manifest,
			    	ContentLocation : resource.ContentLocation,
			    	AppPath : resource.AppPath
				})
			});
		    
		}, postError);
	});
});