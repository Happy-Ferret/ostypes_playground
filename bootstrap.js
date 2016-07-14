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

    // OSStuff.dirwatcher_handler = function(aMonitor, aFile, aOtherFile, aEventType) {
    OSStuff.dirwatcher_handler = function(aMonitor, aFile, aOtherFile, aEventType) {
        // console.log('in dirwatcher_handler', 'aMonitor:', aMonitor, 'aFile:', aFile, 'aOtherFile:', aOtherFile, 'aEventType:', aEventType);

    };

    OSStuff.dirwatcher_handler_c = ctypes.FunctionType(ostypes.TYPE.CALLBACK_ABI, ostypes.TYPE.gpointer, [ostypes.TYPE.gpointer, ostypes.TYPE.gpointer, ostypes.TYPE.gpointer, ostypes.TYPE.GFileMonitorFlags]).ptr(OSStuff.dirwatcher_handler);

	var path = OS.Constants.Path.desktopDir;
    console.log('ok done main');

    var gfile = ostypes.API('g_file_new_for_path')(path);
    console.log('gfile:', gfile, gfile.toString());

    if (gfile.isNull()) {
        console.error('failed to create gfile for path:', path);
        throw new Error('failed to create gfile for path: ' + path);
    }

    var mon = ostypes.API('g_file_monitor_directory')(gfile, ostypes.CONST.G_FILE_MONITOR_NONE, null, null);
    console.log('mon:', mon, mon.toString());

    ostypes.API('g_object_unref')(gfile);
    if (mon.isNull()) {
        console.error('failed to create dirwatcher for path:', path);
        throw new Error('failed to create dirwatcher for path: ' + path);
    }

    // var id = ostypes.API('g_signal_connect_data')(mon, 'dirwatcher::triggered', OSStuff.dirwatcher_handler_c, null, null, ostypes.CONST.G_CONNECT_AFTER);
    var id = ostypes.API('g_signal_connect_data')(mon, 'changed', OSStuff.dirwatcher_handler_c, null, null, ostypes.CONST.G_CONNECT_AFTER);
    console.log('id:', id);
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
// end - common helper functions
