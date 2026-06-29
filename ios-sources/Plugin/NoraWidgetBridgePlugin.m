#import <Capacitor/Capacitor.h>

// Register the plugin with Capacitor's bridge
CAP_PLUGIN(NoraWidgetBridgePlugin, "NoraWidgetBridge",
    CAP_PLUGIN_METHOD(setWidgetData, CAPPluginReturnPromise);
)
