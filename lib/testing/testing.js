// Closure to protect global scope
(function () {
	// a method that takes an object and exports several properties to it
	var provider = function (exportObj) {
		// Define some utility functions

		// Call fn, in scope, once for each element or property in obj, passing property, propertyName, and obj
		var map = function (obj,fn,scope) {
			// Create an array to store the results
			var map = [];

			// If the obj that we are iterating is an array
			if (obj instanceof Array) {
				// Loop over its numeric indicies
				for (var i = 0; i < obj.length; i++) {
					// Store the result of calling the fn
					map.push(fn.call(scope,obj[i],i,obj));
				}
			} else {
				// Loop of its named properties
				for (var propertyName in obj) {
					// Only if the are on the object itself
					if (obj.hasOwnProperty(propertyName)) {
						// Store the result of calling the fn
						map.push(fn.call(scope,obj[propertyName],propertyName,obj));
					}
				}
			}

			// Return the map
			return map;
		};

		var asyncIterate = function (array,fn,scope,finished,finishedScope) {
			var callee = arguments.callee;
			if (array.length) {
				fn.call(scope,array[0],function () {
					callee(array.slice(1),fn,scope,finished,finishedScope);
				});
			} else {
				finished && finished.call(finishedScope);
			}
		};

		// If addDefaultListener is not false, a default listener will be added that logs test results to console.log
		var Runner = function (addDefaultListener) {
			this.listeners = [];
			// Add the default listener, unless explicitly told not to
			addDefaultListener !== false && this.addListener(function (messageType,payload) {
				if (messageType !== 'report') {
					console.log(messageType,':',payload.assertionText,payload.error && payload.error.message ? ': "' + payload.error.message + '" ' : '',payload.error ? payload.error : '');
				} else {
					console.log(messageType,': success: ',payload.successCount,' failure: ',payload.failureCount);
				}
			});
		};

		Runner.prototype = {
			constructor : Runner,
			successCount : 0,
			failureCount : 0,
			log : function (result,test,error) {
				// Increment the successes or failures count
				result === 'success' ? this.successCount++ : this.failureCount++;

				// Call the listeners
				map(this.listeners,function (listener) {
					listener.handler.call(listener.scope,result,{testFn : test.testFn, assertionText : test.assertionText, error : error});
				},this);
			},
			// Add a new listener
			addListener : function (handler,scope) {
				this.listeners.push({
					handler : handler,
					scope : scope
				});
			},
			// A function that logs a report
			report : function () {
				// Call the listeners
				map(this.listeners,function (listener) {
					listener.handler.call(listener.scope,'report',{
						successCount : this.successCount,
						failureCount : this.failureCount
					});
				},this);

			}
		};

		var Assert = function (passed,message) {
			if (!passed) {
				var error = new Error(message);
				if (Wait.instance) {
					Assert.AsyncFail(error);
				} else {
					throw error;
				}
			}
		};

		Assert.AsyncFail = function (error) {
			Wait.cancel();
			arguments.callee.callback && arguments.callee.callback(error);
		};

		var Wait = function (cancel,time,message) {
			if (this instanceof arguments.callee) {
				Wait.instance = this;

				this.cancel = cancel;
				this.time = time !== undefined ? time : 1E3;
				this.message = message !== undefined ? message : 'Wait timed out.';
			} else {
				return new arguments.callee(cancel,time,message);
			}
		};
		Wait.startTimeout = function () {
			// set a timeout
			this.timeout = setTimeout(function () {
				Assert.AsyncFail(new Error('timeout'));
			},this.instance.time);
		};
		Wait.cancel = function () {
			clearTimeout(this.timeout);
			if (this.instance && this.instance.cancel !== undefined) {
				if (typeof this.instance.cancel === 'function') {
					this.instance.cancel();
				} else {
					clearTimeout(this.instance.cancel);
				}
			}
		};

		var Resume = function () {
			Wait.cancel();
			arguments.callee.callback && arguments.callee.callback();
		};

		var Test = function (assertionText,testFn) {
			this.testFn = testFn;
			this.assertionText = assertionText;
		};

		Test.prototype = {
			constructor : Test,
			run : function (scope,successCallback,failureCallback,completeCallback) {
				try {
					delete Wait.instance;

					// run the test fn
					this.testFn.call(scope);

					// if there is a wait
					if (Wait.instance) {
						var instance = Wait.instance;

						Assert.AsyncFail.callback = function (error) {
							failureCallback(error);
							completeCallback();
						};

						Wait.startTimeout();

						// set a call back for resume
						Resume.callback = function () {
							// run sucess
							successCallback();
							completeCallback();
						};
					} else {
						// there is no wait, so run the success callback
						successCallback();
					}
				} catch (e) {
					failureCallback(e);
				} finally {
					!Wait.instance && completeCallback();
				}
			}
		};

		var Suite = function (config) {
			// Create a tests array to hold tests that belong to this suite
			this.tests = [];

			// Save a reference to the runner
			this.runner = config.runner;
			this.setUp = config.setUp;
			this.tearDown = config.tearDown;

			// Delete the non-test properties from the config
			delete config.runner;
			delete config.setUp;
			delete config.tearDown;

			// Add the rest of the config as tests
			this.addTests(config);
		};

		// Suite inherits from test
		Suite.prototype = {
			constructor : Suite,
			addTests : function (config) {
				map(config,function (property,propertyName) {
					// create and add each Test
					/\s/.test(propertyName) && this.tests.push(new Test(propertyName,config[propertyName]));
				},this);
			},
			// A method that runs all a Suite's tests
			run : function () {
				// Loop over all of the numeric indicies of this.tests

				asyncIterate(this.tests,function (test,callback) {
					// Run the setup
					this.setUp && this.setUp.call(this);

					var self = this;

					test.run(this,function () {
						// Log the success
						self.runner.log('success',test);
					},function (e) {
						// Log the failure
						self.runner.log('failure',test,e);
					},function () {
						// Run the teardown
						self.tearDown && self.tearDown.call(self);
						callback();
					});
					
				},this,this.runner.report,this.runner);
			}
		};

		// If an export obj was provided, use that
		if (exportObj) {
			exportObj.Test = Test;
			exportObj.Suite = Suite;
			exportObj.Runner = Runner;
			exportObj.Assert = Assert;
			exportObj.Wait = Wait;
			exportObj.Resume = Resume;
		} else {
			// Otherwise, export these to the global namespace
			this.Test = Test;
			this.Suite = Suite;
			this.Runner = Runner;
			this.Assert = Assert;
			this.Wait = Wait;
			this.Resume = Resume;
		}
	};

	// if node is used,
	if (typeof module !== 'undefined') {
		// export the exportables into module.exports
		provider(module.exports);
	} else {
		// expose the provider as a global if there is no module global
		this['git://github.com/oatkiller/testingjs.git'] = provider;
	}

})();
