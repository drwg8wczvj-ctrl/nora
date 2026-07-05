#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NativeTabBarPlugin, "NativeTabBar",
    CAP_PLUGIN_METHOD(setup,         CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setActiveTab,  CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setAppearance, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(show,          CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(hide,          CAPPluginReturnPromise);
)
