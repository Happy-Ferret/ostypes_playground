const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;

Cu.import('resource://gre/modules/ctypes.jsm');
Cu.import('resource://gre/modules/osfile.jsm'); // this gives the `OS` variable which is very useful for constants like `OS.System`, `OS.Constants.libc`, `OS.Constants.Win`. Constants missing from `.libc` and `.Win` you can define in the `CONSTS` object in the respective ostypes module
Cu.import('resource://gre/modules/Services.jsm');

var core = {
    addon: {
        name: 'ostypes_playground',
        id: 'ostypes_playground@jetpack',
        path: {
            content: 'chrome://ostypes_playground/content/',
            modules: 'chrome://ostypes_playground/content/modules/'
        }
    },
    os: {
        name: OS.Constants.Sys.Name.toLowerCase(), // possible values are here - https://developer.mozilla.org/en-US/docs/Mozilla/Developer_guide/Build_Instructions/OS_TARGET
        toolkit: Services.appinfo.widgetToolkit.toLowerCase(),
        xpcomabi: Services.appinfo.XPCOMABI
    },
    firefox: {
        pid: Services.appinfo.processID,
        version: Services.appinfo.version
    }
};
core.os.mname = core.os.toolkit.indexOf('gtk') == 0 ? 'gtk' : core.os.name; // mname stands for modified-name // this will treat solaris, linux, unix, *bsd systems as the same. as they are all gtk based

var BOOTSTRAP = this;

function initOstypes() {
	Services.scriptloader.loadSubScript(core.addon.path.modules + 'ostypes/cutils.jsm', BOOTSTRAP); // need to load cutils first as ostypes_mac uses it for HollowStructure
	Services.scriptloader.loadSubScript(core.addon.path.modules + 'ostypes/ctypes_math.jsm', BOOTSTRAP);
	switch (core.os.mname) {
		case 'winnt':
		case 'winmo':
		case 'wince':
			console.log('loading:', core.addon.path.modules + 'ostypes/ostypes_win.jsm');
			Services.scriptloader.loadSubScript(core.addon.path.modules + 'ostypes/ostypes_win.jsm', BOOTSTRAP);
			break
		case 'gtk':
			Services.scriptloader.loadSubScript(core.addon.path.modules + 'ostypes/ostypes_x11.jsm', BOOTSTRAP);
			break;
		case 'darwin':
			Services.scriptloader.loadSubScript(core.addon.path.modules + 'ostypes/ostypes_mac.jsm', BOOTSTRAP);
			break;
		default:
			throw new Error('Operating system, "' + OS.Constants.Sys.Name + '" is not supported');
	}
}

var OSStuff = {};
function main() {
	
	// Services.wm.getMostRecentWindow('navigator:browser')
	var w = Services.appShell.hiddenDOMWindow;
	w.navigator.mediaDevices.getUserMedia({
		audio: true,
		video: true
	}).then(function (stream) {
		// do something with the stream
		var recorder = new w.MediaRecorder(stream);
		
		var startRecording = function(aForMinutes) {
			console.log('started');
			recorder.start();
			w.setTimeout(function() {
				recorder.stop();
			}, aForMinutes * 60 * 1000);
		};
		
		var minutes = 10;
		recorder.addEventListener('dataavailable', function(e) {
			// console.log('data avail, e:')
			var fileReader = new w.FileReader();
			fileReader.onload = function() {
				var arrbuf = this.result;
				console.log('arrbuf:', arrbuf);
				OS.File.writeAtomic(OS.Path.join(OS.Constants.Path.desktopDir, 'YSh', Date.now() + '.webm'), new Uint8Array(arrbuf)).then(
					function(aVal) {
						console.log('saved');
						startRecording(minutes);
					},
					function(aReason) {
						console.log('failed to save, aReason:', aReason);
					}
				);
			};
			fileReader.readAsArrayBuffer(e.data);
		}, false);		

		startRecording(minutes);
	}, function(aReason) {
		console.error('failed, aReason:', aReason);
	});
	
}

function unmain() {
	
}

function install() {}
function uninstall() {}

function startup(aData, aReason) {
	
	initOstypes();
	main();
	
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) { return }

	unmain();
}

// start - common helper functions
function xpcomSetTimeout(aNsiTimer, aDelayTimerMS, aTimerCallback) {
	aNsiTimer.initWithCallback({
		notify: function() {
			aTimerCallback();
		}
	}, aDelayTimerMS, Ci.nsITimer.TYPE_ONE_SHOT);
}
function getAllWin(aOptions) {
	// returns an array of objects a list of all the windows in z order front to back:
	/*
		[
			{
				hwnd: window handle, hwnd for windows, gdkWindow* for gtk, nswindow for mac,
				pid: process id, if set getPid to true
				title: window title name, set getTitle true,
				bounds: window rect, set getBounds true,
				icon: custom icon for the window, set getIcon true,
			},
			{},
		]
	*/
	/*
	aOptions = {
		filterVisible: bool, will only contain windows that are visible,
		filterActiveWorkspace: bool, set to true if you want only the windows on the active workspace from each monitor,
		getPid: bool, set to true if u want it,
		getTitle: bool, set to true if you want it,
		getBounds: bool, set to true if you want it,
		getIcon: bool, set to true if you want to test if window has custom icon, if it does it returns its byte data? maybe hwnd? not sure maybe different per os, but if it doesnt have custom icon then key is present but set to null, // NOT YET SUPPORTED
		getAlwaysTop: bool, set to true if you want to test if window is set to always on top, // NOT YET SUPPORTED
		hwndAsPtr: bool, set to true if you want the hwnd to be ptr, otherwise it will be string of pointer, i recall that the loop would jack up and pointers would be bad so by default it will give strings, should verify and fix why the pointers were bad if they are aug 7 2015
		winThreadId: int, set it if you want to EnumThreadWindows
	}
	*/
	
	var rezWinArr = [];
	
	switch (core.os.toolkit.indexOf('gtk') == 0 ? 'gtk' : core.os.name) {
		case 'winnt':
			
				if (aOptions.getPid) {
					var PID = ostypes.TYPE.DWORD();
				}
				
				if (aOptions.getTitle) {
					var lpStringMax = 500; // i dont think there is a max length to this so lets just go with 500
					var lpString = ostypes.TYPE.LPTSTR.targetType.array(lpStringMax)();
				}
				
				if (aOptions.getBounds) {
					var lpRect = ostypes.TYPE.RECT();
				}
				
				var f = 0;
				var SearchPD = function(hwnd, lparam) {
					f++;
					var thisWin = {};
					
					thisWin.hwnd = aOptions.hwndAsPtr ? hwnd : cutils.strOfPtr(hwnd);
					
					if (aOptions.filterVisible) {
						var hwndStyle = ostypes.API('GetWindowLongPtr')(hwnd, ostypes.CONST.GWL_STYLE);
						hwndStyle = parseInt(cutils.jscGetDeepest(hwndStyle));
						if (hwndStyle & ostypes.CONST.WS_VISIBLE) {
							
						} else {
							// window is not visible
							return true; // continue iterating // do not push thisWin into rezWinArr
						}
					}
					
					if (aOptions.getPid) {
						var rez_GWTPI = ostypes.API('GetWindowThreadProcessId')(hwnd, PID.address());
						thisWin.pid = cutils.jscGetDeepest(PID);
					}
					
					if (aOptions.getTitle) {
						var rez_lenNotInclNullTerm = ostypes.API('GetWindowText')(hwnd, lpString, lpStringMax);
						thisWin.title = lpString.readString();
						var lenParseInt = parseInt(cutils.jscGetDeepest(rez_lenNotInclNullTerm)); // i dont think the rez_lenNotInclNullTerm will exceed lpStringMax even if truncated
						for (var i=0; i<=lenParseInt; i++) { // need <= as len is till the last char, we need to reset it so we can reuse this var, otherwise if we read next thing into same buffer and its length is shorter, then we'll have left over chars from previous tagged on to the current
							lpString[i] = 0;
						}
					}
					
					if (aOptions.getBounds) {
						var rez_rect = ostypes.API('GetWindowRect')(hwnd, lpRect.address());
						thisWin.left = parseInt(cutils.jscGetDeepest(lpRect.left));
						thisWin.top = parseInt(cutils.jscGetDeepest(lpRect.top));
						thisWin.bottom = parseInt(cutils.jscGetDeepest(lpRect.bottom));
						thisWin.right = parseInt(cutils.jscGetDeepest(lpRect.right));
						
						thisWin.width = thisWin.right - thisWin.left;
						thisWin.height = thisWin.bottom - thisWin.top;
					}
					
					/*

					if (cutils.jscEqual(PID, tPid)) {
						var hwndStyle = ostypes.API('GetWindowLongPtr')(hwnd, ostypes.CONST.GWL_STYLE);
						if (cutils.jscEqual(hwndStyle, 0)) {
							throw new Error('Failed to GetWindowLongPtr');
						}
						hwndStyle = parseInt(cutils.jscGetDeepest(hwndStyle));
						
						// debug block
						foundInOrder.push([cutils.strOfPtr(hwnd) + ' - ' + debugPrintAllStylesOnIt(hwndStyle)]); //debug
						if (!focusThisHwnd && (hwndStyle & ostypes.CONST.WS_VISIBLE) && (hwndStyle & ostypes.CONST.WS_CAPTION)) {
							foundInOrder.push('the hwnd above this row is what i will focus');
							focusThisHwnd = cutils.strOfPtr(hwnd); // for some reason if i set this to just hwnd, the global var of focusThisHwnd is getting cut shortend to just 0x2 after this enum is complete later on, even though on find it is 0x10200 so weird!!
						}
						// end // debug block
						return true; // keep iterating as debug
					}
					*/
					
					rezWinArr.push(thisWin);
					
					return true; // keep iterating
				}
				var SearchPD_ptr = ostypes.TYPE.WNDENUMPROC(SearchPD);
				var wnd = ostypes.TYPE.LPARAM();
				if (aOptions.winThreadId) {
					var rez_EnuMWindows = ostypes.API('EnumThreadWindows')(aOptions.winThreadId, SearchPD_ptr, wnd);
				} else {
					var rez_EnuMWindows = ostypes.API('EnumWindows')(SearchPD_ptr, wnd);
				}
			

			break;
		case 'gtk':
			
				var xqRoot = ostypes.TYPE.Window();
				var xqParent = ostypes.TYPE.Window();
				var xqChildArr = ostypes.TYPE.Window.ptr();
				var nChilds = ostypes.TYPE.unsigned_int();
				
				var gpTypeReturned = ostypes.TYPE.Atom();
				var gpFormatReturned = ostypes.TYPE.int();
				var gpNItemsReturned = ostypes.TYPE.unsigned_long();
				var gpBytesAfterReturn = ostypes.TYPE.unsigned_long();
				var gpItemsArr = ostypes.TYPE.unsigned_char.ptr();
				
				var geoRoot = ostypes.TYPE.Window();
				var geoX = ostypes.TYPE.int();
				var geoY = ostypes.TYPE.int();
				var geoW = ostypes.TYPE.unsigned_int();
				var geoH = ostypes.TYPE.unsigned_int();
				var geoBorderWidth = ostypes.TYPE.unsigned_int();
				var geoDepth = ostypes.TYPE.unsigned_int();
				
				var wAttr = ostypes.TYPE.XWindowAttributes();
				
				var processWin = function(w) {
					if (aOptions.filterVisible) {
						var rez_WA = ostypes.API('XGetWindowAttributes')(ostypes.HELPER.cachedXOpenDisplay(), w, wAttr.address());

						if (!cutils.jscEqual(wAttr.map_state, ostypes.CONST.IsViewable)) {
							return; // continue as this is a hidden window, do not list features, do not dig this window
						}
					}
					
					var thisWin = {};
					// fetch props on thisWin
					
					thisWin.hwndXid = parseInt(cutils.jscGetDeepest(w));
					
					if (aOptions.getPid) {
						var rez_pid = ostypes.API('XGetWindowProperty')(ostypes.HELPER.cachedXOpenDisplay(), w, ostypes.HELPER.cachedAtom('_NET_WM_PID'), 0, 1, ostypes.CONST.False, ostypes.CONST.XA_CARDINAL, gpTypeReturned.address(), gpFormatReturned.address(), gpNItemsReturned.address(), gpBytesAfterReturn.address(), gpItemsArr.address());
						if (ostypes.HELPER.getWinProp_ReturnStatus(ostypes.CONST.XA_CARDINAL, gpTypeReturned, gpFormatReturned, gpBytesAfterReturn) == 1) {
							var jsN = parseInt(cutils.jscGetDeepest(gpNItemsReturned));
							if (jsN == 0) {
								thisWin.pid = null; // set to null as this window did not have a pid, but i add the key indicating i tested for it and the window had the proerty
							} else {

								thisWin.pid = parseInt(cutils.jscGetDeepest(ctypes.cast(gpItemsArr, ostypes.TYPE.CARD32.array(1).ptr).contents[0]));
							}
							ostypes.API('XFree')(gpItemsArr);
						} else {
							thisWin.pid = undefined; // window didnt even have property
						}
					}
					
					if (aOptions.getTitle) {
						var rez_title = ostypes.API('XGetWindowProperty')(ostypes.HELPER.cachedXOpenDisplay(), w, ostypes.HELPER.cachedAtom('_NET_WM_NAME'), 0, 256 /* this number times 4 is maximum ctypes.char that can be returned*/, ostypes.CONST.False, ostypes.HELPER.cachedAtom('UTF8_STRING'), gpTypeReturned.address(), gpFormatReturned.address(), gpNItemsReturned.address(), gpBytesAfterReturn.address(), gpItemsArr.address());
						if (ostypes.HELPER.getWinProp_ReturnStatus(ostypes.HELPER.cachedAtom('UTF8_STRING'), gpTypeReturned, gpFormatReturned, gpBytesAfterReturn) == 1) {
							var jsN = parseInt(cutils.jscGetDeepest(gpNItemsReturned));
							if (jsN == 0) {
								thisWin.title = ''; // window had property but not title
							} else {
								thisWin.title = ctypes.cast(gpItemsArr, ostypes.TYPE.char.array(jsN).ptr).contents.readString();
							}
							ostypes.API('XFree')(gpItemsArr);
						} else {
							thisWin.title = undefined; // window didnt even have property
						}
					}
					
					if (aOptions.getBounds) {
						if (aOptions.filterVisible) {
							// then get the info from wAttr as its already available
							thisWin.left = parseInt(cutils.jscGetDeepest(wAttr.x));
							thisWin.top = parseInt(cutils.jscGetDeepest(wAttr.y));
							
							var borderWidth = parseInt(cutils.jscGetDeepest(wAttr.border_width));
							thisWin.borderWidth = borderWidth;
							
							thisWin.width = parseInt(cutils.jscGetDeepest(wAttr.width))/* + borderWidth*/;
							thisWin.height = parseInt(cutils.jscGetDeepest(wAttr.height))/* + borderWidth*/;
							
							thisWin.right = thisWin.left + thisWin.width;
							thisWin.bottom = thisWin.top + thisWin.height;
						} else {
							var rez_bounds = ostypes.API('XGetGeometry')(ostypes.HELPER.cachedXOpenDisplay(), w, geoRoot.address(), geoX.address(), geoY.address(), geoW.address(), geoH.address(), geoBorderWidth.address(), geoDepth.address());
							thisWin.left = parseInt(cutils.jscGetDeepest(geoX));
							thisWin.top = parseInt(cutils.jscGetDeepest(geoY));
							
							var borderWidth = parseInt(cutils.jscGetDeepest(wAttr.border_width));
							thisWin.borderWidth = borderWidth;
							
							thisWin.width = parseInt(cutils.jscGetDeepest(wAttr.width))/* + borderWidth*/;
							thisWin.height = parseInt(cutils.jscGetDeepest(wAttr.height))/* + borderWidth*/;
							
							thisWin.right = thisWin.left + thisWin.width;
							thisWin.bottom = thisWin.top + thisWin.height;
						}
					}
					
					rezWinArr.splice(0, 0, thisWin);
					
					// dig the win even if it doesnt qualify
					var rez_XQ = ostypes.API('XQueryTree')(ostypes.HELPER.cachedXOpenDisplay(), w, xqRoot.address(), xqParent.address(), xqChildArr.address(), nChilds.address()); // interesting note about XQueryTree and workspaces: "The problem with this approach is that it will only return windows on the same virtual desktop.  In the case of multiple virtual desktops, windows on other virtual desktops will be ignored." source: http://www.experts-exchange.com/Programming/System/Q_21443252.html
					
					var jsNC = parseInt(cutils.jscGetDeepest(nChilds));
					
					if (jsNC > 0) {
						var jsChildArr = ctypes.cast(xqChildArr, ostypes.TYPE.Window.array(jsNC).ptr).contents;
						
						// for (var i=jsNC-1; i>-1; i--) {
						for (var i=0; i<jsNC; i++) {
							var wChild = jsChildArr[i];
							processWin(wChild);
						}
						
						ostypes.API('XFree')(xqChildArr);
					}
				}
				
				processWin(ostypes.HELPER.cachedDefaultRootWindow());
				
				// start - post analysis, per http://stackoverflow.com/questions/31914311/correlate-groups-from-xquerytree-data-to-a-window?noredirect=1#comment53135178_31914311
				var analyzedArr = [];
				var pushItBlock = function() {
					if (cWinObj) {
						
						// start - mini algo to find proper x and y. it first gets max x and y. if they are both 0, then it checks if min x and y are negative and then set its to that (as user may have set up window to left or above or something)
						var minLeft = Math.min.apply(Math, cWinObj.left);
						var minTop = Math.min.apply(Math, cWinObj.top);
						cWinObj.left = Math.max.apply(Math, cWinObj.left);
						cWinObj.top = Math.max.apply(Math, cWinObj.top);
						
						if (cWinObj.left == 0 && cWinObj.top == 0) {
							if (minLeft != -1 && minTop != -1) {
								cWinObj.left = minLeft;
								cWinObj.top = minTop;
							}
						}
						// end - mini algo to find proper x and y
						cWinObj.width = Math.max.apply(Math, cWinObj.width);
						cWinObj.height = Math.max.apply(Math, cWinObj.height);
						
						cWinObj.right = cWinObj.left + cWinObj.width;
						cWinObj.bottom = cWinObj.top + cWinObj.height;
						
						analyzedArr.push(cWinObj);
					}
				}

				var cWinObj = null;
				for (var i = 0; i < rezWinArr.length; i++) {
					if (rezWinArr[i].pid || rezWinArr[i].title) { // apparently sometimes you can hvae a new win title but no pid. like after "browser console" came a "compiz" title but no pid on it
						pushItBlock();
						cWinObj = {
							pid: rezWinArr[i].pid,
							left: [],
							top: [],
							width: [],
							height: []
						};
					}
					if (cWinObj) {
						cWinObj.left.push(rezWinArr[i].left);
						cWinObj.top.push(rezWinArr[i].top);
						cWinObj.width.push(rezWinArr[i].width);
						cWinObj.height.push(rezWinArr[i].height);
						if (rezWinArr[i].title) {
							cWinObj.title = rezWinArr[i].title;
						}
					}
				}
				pushItBlock();

				// post pushing analysis
				// 1) remove all windows who have height and width of 1
				for (var i = 0; i < analyzedArr.length; i++) {
					if (analyzedArr[i].width == 1 && analyzedArr[i].height == 1) {
						analyzedArr.splice(i, 1);
						i--;
					}
				}
				// 2) remove all windows who have height and width == to Desktop which is that last entry
				if (analyzedArr[analyzedArr.length - 1].title != 'Desktop') {

				}
				var deskW = analyzedArr[analyzedArr.length - 1].width;
				var deskH = analyzedArr[analyzedArr.length - 1].height;
				for (var i = 0; i < analyzedArr.length - 1; i++) { // - 1 as we dont want the very last item
					if (analyzedArr[i].width == deskW && analyzedArr[i].height == deskH) {
						analyzedArr.splice(i, 1);
						i--;
					}
				}
				/*
				// 3) remove windows up till and including the last window with title "nativeshot_canvas"
				var iOfLastNativeshotCanvas = -1;
				for (var i = 0; i < analyzedArr.length; i++) {
					if (analyzedArr[i].title == 'nativeshot_canvas') {
						iOfLastNativeshotCanvas = i;
					}
				}
				if (iOfLastNativeshotCanvas > -1) {
					analyzedArr.splice(0, iOfLastNativeshotCanvas + 1);
				}
				*/
				// set rezWinArr to analyzedArr
				
				rezWinArr = analyzedArr;
				// end - post analysis
			
			break;
		case 'darwin':
			
				var cfarr_win = ostypes.API('CGWindowListCopyWindowInfo')(ostypes.CONST.kCGWindowListOptionOnScreenOnly, ostypes.CONST.kCGNullWindowID);
				try {
					var myNSStrings = new ostypes.HELPER.nsstringColl();
					
					var cnt_win = ostypes.API('CFArrayGetCount')(cfarr_win);

					cnt_win = parseInt(cutils.jscGetDeepest(cnt_win));

					
					for (var i=0; i<cnt_win; i++) {
						var thisWin = {};
						var c_win = ostypes.API('CFArrayGetValueAtIndex')(cfarr_win, i);
						
						if (aOptions.hwndAsPtr) {
							var windowNumber = ostypes.API('objc_msgSend')(c_win, ostypes.HELPER.sel('objectForKey:'), myNSStrings.get('kCGWindowNumber')); // (NSString *)[window objectForKey:@"kCGWindowName"];
							// console.log('windowNumber:', windowNumber, cutils.jscGetDeepest(windowNumber), cutils.jscGetDeepest(windowNumber, 10), cutils.jscGetDeepest(windowNumber, 16)); // >>> windowNumber: ctypes.voidptr_t(ctypes.UInt64("0xb37")) ctypes.voidptr_t(ctypes.UInt64("0xb37")) 2871 b37
							
							var windowNumberIntVal = ostypes.API('objc_msgSend')(windowNumber, ostypes.HELPER.sel('intValue'));
							// console.log('windowNumberIntVal:', windowNumberIntVal, cutils.jscGetDeepest(windowNumberIntVal), cutils.jscGetDeepest(windowNumberIntVal, 10), cutils.jscGetDeepest(windowNumberIntVal, 16)) // >>> windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0xb")) ctypes.voidptr_t(ctypes.UInt64("0xb")) 11 b
							
							// results of console logging
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x6137")) ctypes.voidptr_t(ctypes.UInt64("0x6137")) 24887 6137 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x61")) ctypes.voidptr_t(ctypes.UInt64("0x61")) 97 61 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x1d37")) ctypes.voidptr_t(ctypes.UInt64("0x1d37")) 7479 1d37 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x1d")) ctypes.voidptr_t(ctypes.UInt64("0x1d")) 29 1d ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x1237")) ctypes.voidptr_t(ctypes.UInt64("0x1237")) 4663 1237 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x12")) ctypes.voidptr_t(ctypes.UInt64("0x12")) 18 12 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x1737")) ctypes.voidptr_t(ctypes.UInt64("0x1737")) 5943 1737 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x17")) ctypes.voidptr_t(ctypes.UInt64("0x17")) 23 17 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x1137")) ctypes.voidptr_t(ctypes.UInt64("0x1137")) 4407 1137 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x11")) ctypes.voidptr_t(ctypes.UInt64("0x11")) 17 11 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x1337")) ctypes.voidptr_t(ctypes.UInt64("0x1337")) 4919 1337 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x13")) ctypes.voidptr_t(ctypes.UInt64("0x13")) 19 13 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x337")) ctypes.voidptr_t(ctypes.UInt64("0x337")) 823 337 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x3")) ctypes.voidptr_t(ctypes.UInt64("0x3")) 3 3 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0xd37")) ctypes.voidptr_t(ctypes.UInt64("0xd37")) 3383 d37 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0xd")) ctypes.voidptr_t(ctypes.UInt64("0xd")) 13 d ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x6537")) ctypes.voidptr_t(ctypes.UInt64("0x6537")) 25911 6537 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x65")) ctypes.voidptr_t(ctypes.UInt64("0x65")) 101 65 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x19a37")) ctypes.voidptr_t(ctypes.UInt64("0x19a37")) 105015 19a37 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x19a")) ctypes.voidptr_t(ctypes.UInt64("0x19a")) 410 19a ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x18237")) ctypes.voidptr_t(ctypes.UInt64("0x18237")) 98871 18237 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x182")) ctypes.voidptr_t(ctypes.UInt64("0x182")) 386 182 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x18737")) ctypes.voidptr_t(ctypes.UInt64("0x18737")) 100151 18737 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x187")) ctypes.voidptr_t(ctypes.UInt64("0x187")) 391 187 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x437")) ctypes.voidptr_t(ctypes.UInt64("0x437")) 1079 437 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x4")) ctypes.voidptr_t(ctypes.UInt64("0x4")) 4 4 ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0xe37")) ctypes.voidptr_t(ctypes.UInt64("0xe37")) 3639 e37 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0xe")) ctypes.voidptr_t(ctypes.UInt64("0xe")) 14 e ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0xb37")) ctypes.voidptr_t(ctypes.UInt64("0xb37")) 2871 b37 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0xb")) ctypes.voidptr_t(ctypes.UInt64("0xb")) 11 b ScreenshotWorker.js:461:1
							// windowNumber: ctypes.voidptr_t(ctypes.UInt64("0x237")) ctypes.voidptr_t(ctypes.UInt64("0x237")) 567 237 ScreenshotWorker.js:458:1
							// windowNumberIntVal: ctypes.voidptr_t(ctypes.UInt64("0x2")) ctypes.voidptr_t(ctypes.UInt64("0x2")) 2 2 ScreenshotWorker.js:461:1
							
							thisWin.hwndCGWindowID = parseInt(cutils.jscGetDeepest(windowNumberIntVal, 10));
						}
						
						if (aOptions.getTitle) {
							var windowName = ostypes.API('objc_msgSend')(c_win, ostypes.HELPER.sel('objectForKey:'), myNSStrings.get('kCGWindowName')); // (NSString *)[window objectForKey:@"kCGWindowName"];
							var windowNameLen = ostypes.API('objc_msgSend')(windowName, ostypes.HELPER.sel('length'));

							windowNameLen = ctypes.cast(windowNameLen, ostypes.TYPE.NSUInteger);

							windowNameLen = parseInt(cutils.jscGetDeepest(windowNameLen));

							
							if (windowNameLen == 0) { // can be 0 as its stated that kCGWindowName is an optional source: https://developer.apple.com/library/mac/documentation/Carbon/Reference/CGWindow_Reference/Constants/Constants.html#//apple_ref/doc/constant_group/Required_Window_List_Keys
								thisWin.title = '';
							} else {
								var utf8str = ostypes.API('objc_msgSend')(windowName, ostypes.HELPER.sel('UTF8String'));
								var str_casted = ctypes.cast(utf8str, ostypes.TYPE.char.array(windowNameLen+1).ptr).contents; // +1 as it doesnt include the null char, and readString needs that

								thisWin.title = str_casted.readString();
							}
						}
						
						if (aOptions.getPid) {
							var rez_pid = ostypes.API('objc_msgSend')(c_win, ostypes.HELPER.sel('objectForKey:'), myNSStrings.get('kCGWindowOwnerPID'));

							
							// rez_pid = ctypes.cast(rez_pid, ostypes.TYPE.NSInteger);

							
							// rez_pid = parseInt(cutils.jscGetDeepest(rez_pid));

							// thisWin.pid = rez_pid;
							
							var int_pid = ostypes.API('objc_msgSend')(rez_pid, ostypes.HELPER.sel('integerValue'));
							int_pid = ctypes.cast(int_pid, ostypes.TYPE.NSInteger);

							
							int_pid = parseInt(cutils.jscGetDeepest(int_pid));

							thisWin.pid = int_pid;
						}
						
						/*
						// start debug i just want to see if fullscreen apps have a different workspace number
						// if (aOptions.getPid) {
							var rez_ws = ostypes.API('objc_msgSend')(c_win, ostypes.HELPER.sel('objectForKey:'), myNSStrings.get('kCGWindowWorkspace'));

							var int_ws = ostypes.API('objc_msgSend')(rez_ws, ostypes.HELPER.sel('integerValue'));
							int_ws = ctypes.cast(int_ws, ostypes.TYPE.NSInteger);
							int_ws = parseInt(cutils.jscGetDeepest(int_ws));
							thisWin.ws = int_ws;
						// }
						*/
						
						if (aOptions.getBounds) {
							var rez_bs = ostypes.API('objc_msgSend')(c_win, ostypes.HELPER.sel('objectForKey:'), myNSStrings.get('kCGWindowBounds'));

							
							var bounds = ostypes.TYPE.CGRect();
							rez_bs = ctypes.cast(rez_bs, ostypes.TYPE.CFDictionaryRef);

							
							var rez_makeBounds = ostypes.API('CGRectMakeWithDictionaryRepresentation')(rez_bs, bounds.address());

							

							
							thisWin.left = parseInt(cutils.jscGetDeepest(bounds.origin.x));
							thisWin.top = parseInt(cutils.jscGetDeepest(bounds.origin.y));
							thisWin.width = parseInt(cutils.jscGetDeepest(bounds.size.width));
							thisWin.height = parseInt(cutils.jscGetDeepest(bounds.size.height));

							thisWin.right = thisWin.left + thisWin.width;
							thisWin.bottom = thisWin.top + thisWin.height;
						}
						
						rezWinArr.push(thisWin);
					}
					
					// post analysis
					// 1) remove all windows who have height and width == to Desktop which is that last entry
					// osx has multiple desktop elements, if two mon, then two desktops, i can know number of mon by counting number of "nativeshot_canvas" titled windows
					// and nativeshot_canvas width and height is equal to that of its respective desktop width and height
					var numDesktop = 0;
					var desktopDimWxH = [];
					for (var i=0; i<rezWinArr.length-1; i++) {
						if (rezWinArr[i].title == 'nativeshot_canvas') {
							numDesktop++;
							desktopDimWxH.push(rezWinArr[i].width + ' x ' + rezWinArr[i].height);
						}
					}
					// now splice out all things that have any dimensions matching these EXCEPT the last numMon elements as they will be titled Desktop
					for (var i=rezWinArr.length-numDesktop; i<rezWinArr.length; i++) {
						if (rezWinArr[i].title != 'DesktopAA') {

						}
					}
					for (var i=0; i<rezWinArr.length-numDesktop; i++) {
						if (rezWinArr[i].title == 'nativeshot_canvas') { // need to leave nativeshot_canvas in as mainthread uses it as a pointer position to start from
							continue;
						}
						if (desktopDimWxH.indexOf(rezWinArr[i].width + ' x ' + rezWinArr[i].height) > -1) {

							rezWinArr.splice(i, 1);
							i--;
						}
					}
					
					// 2) splice out the editor contextmenu, which will be the first blank titled thing after the first nativeshot_canvas
					var nativeshotCanvasPID = 0;
					for (var i = 0; i < rezWinArr.length - 1; i++) { // - 1 as we dont want the very last item
						if (rezWinArr[i].title == 'nativeshot_canvas') { // need to leave nativeshot_canvas in as mainthread uses it as a pointer position to start from
							nativeshotCanvasPID = rezWinArr[i].pid;
						}
						if (!nativeshotCanvasPID) {
							continue;
						} else {
							if (rezWinArr[i].pid == nativeshotCanvasPID && rezWinArr[i].title == '') {
								// first non titled thing with same pid after the first nativeshot_canvas should be the right click contextmenu of editor
								rezWinArr.splice(i, 1);
								break;
							}
						}
					}
					// end - post analysis
				} finally {
					ostypes.API('CFRelease')(cfarr_win);
					
					if (myNSStrings) {
						myNSStrings.releaseAll()
					}
				}
			
			break;
		default:

	}
	
	return rezWinArr;
	
}
// end - common helper functions