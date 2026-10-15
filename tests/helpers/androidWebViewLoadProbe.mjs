import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';

// Model the installed Capacitor 8.4.3 boundary: layout inflation precedes the
// virtual load() hook; Bridge creation issues the first WebView navigation.
// The source under test is the real MainActivity. Native CI still exercises
// the actual Android framework, cache and Capacitor implementation.
const sources={
 'android/content/SharedPreferences.java':'package android.content; public interface SharedPreferences { int getInt(String key,int fallback); Editor edit(); interface Editor { Editor putInt(String key,int value); void apply(); } }',
 'android/graphics/Color.java':'package android.graphics; public class Color { public static final int WHITE=-1; public static int rgb(int r,int g,int b){return (r<<16)|(g<<8)|b;} }',
 'android/os/Bundle.java':'package android.os; public class Bundle {}',
 'android/os/SystemClock.java':'package android.os; public class SystemClock { public static long uptimeMillis(){return 1L;} }',
 'android/view/View.java':'package android.view; import java.util.*; public class View { private static final List<Runnable> queue=new ArrayList<>(); public boolean post(Runnable task){queue.add(task);return true;} public static void flush(){int remaining=100;while(!queue.isEmpty()){if(--remaining<0)throw new AssertionError("post loop");queue.remove(0).run();}} }',
 'android/view/Window.java':'package android.view; public class Window { private final View decor=new View(); public View getDecorView(){return decor;} public void setNavigationBarColor(int color){} }',
 'android/webkit/WebView.java':'package android.webkit; import com.sogrimhashbon.app.LoadProbe; public class WebView extends android.view.View { public void clearCache(boolean disk){LoadProbe.clear(disk);} public void loadUrl(String url){LoadProbe.navigate();} public void reload(){loadUrl("https://localhost/");} public void setBackgroundColor(int color){} public static void setWebContentsDebuggingEnabled(boolean enabled){} }',
 'android/webkit/ValueCallback.java':'package android.webkit; public interface ValueCallback<T> { void onReceiveValue(T value); }',
 'android/webkit/CookieManager.java':'package android.webkit; import com.sogrimhashbon.app.LoadProbe; public class CookieManager { private static final CookieManager INSTANCE=new CookieManager(); public static CookieManager getInstance(){return INSTANCE;} public void removeAllCookies(ValueCallback<Boolean> done){LoadProbe.clearCookies();if(done!=null)done.onReceiveValue(true);} }',
 'android/webkit/WebStorage.java':'package android.webkit; import com.sogrimhashbon.app.LoadProbe; public class WebStorage { private static final WebStorage INSTANCE=new WebStorage(); public static WebStorage getInstance(){return INSTANCE;} public void deleteAllData(){LoadProbe.clearStorage();} }',
 'androidx/core/splashscreen/SplashScreen.java':'package androidx.core.splashscreen; import java.util.function.BooleanSupplier; public class SplashScreen { public static SplashScreen installSplashScreen(Object activity){return new SplashScreen();} public void setKeepOnScreenCondition(BooleanSupplier condition){} }',
 'androidx/core/view/WindowInsetsControllerCompat.java':'package androidx.core.view; public class WindowInsetsControllerCompat { public void setAppearanceLightStatusBars(boolean value){} public void setAppearanceLightNavigationBars(boolean value){} }',
 'androidx/core/view/WindowCompat.java':'package androidx.core.view; public class WindowCompat { public static WindowInsetsControllerCompat getInsetsController(android.view.Window window,android.view.View view){return new WindowInsetsControllerCompat();} }',
 'com/getcapacitor/android/R.java':'package com.getcapacitor.android; public class R { public static class id { public static final int webview=7; } }',
 'com/getcapacitor/Bridge.java':'package com.getcapacitor; import android.webkit.WebView; public class Bridge { private final WebView view; public Bridge(WebView view){this.view=view;view.loadUrl("https://localhost/");} public WebView getWebView(){return view;} }',
 'com/getcapacitor/BridgeActivity.java':'package com.getcapacitor; import android.content.SharedPreferences; import android.os.Bundle; import android.webkit.WebView; import android.view.*; import com.sogrimhashbon.app.LoadProbe; public class BridgeActivity { protected static final int MODE_PRIVATE=0; private WebView view; private Bridge bridge; private final Window window=new Window(); protected void onCreate(Bundle state){view=new WebView();load();} protected void load(){bridge=new Bridge(view);} public Bridge getBridge(){return bridge;} public void registerPlugin(Class<?> plugin){} public Window getWindow(){return window;} public void runOnUiThread(Runnable task){task.run();} public void onWindowFocusChanged(boolean focus){} public SharedPreferences getSharedPreferences(String name,int mode){return LoadProbe.preferences(name);} @SuppressWarnings("unchecked") public <T extends View>T findViewById(int id){return id==com.getcapacitor.android.R.id.webview?(T)view:null;} }',
 'com/sogrimhashbon/app/LoadProbe.java':[
  'package com.sogrimhashbon.app;',
  'import android.content.SharedPreferences; import android.os.Bundle; import android.view.View; import java.util.*;',
  'class BuildConfig { static boolean NATIVE_QA_WEBVIEW=false; static int VERSION_CODE=190; }',
  'class SogrimCapabilitiesPlugin {}',
  'public class LoadProbe {',
  ' private static final String STORE="sogrim_web_bundle_cache",KEY="installed_version_code";',
  ' private static final Map<String,Map<String,Integer>> stores=new HashMap<>();',
  ' private static final List<String> navigations=new ArrayList<>(); private static int clears=0,puts=0; private static String cached="old-bundle"; private static boolean failClear=false;',
  ' private static final Map<String,String> cookieJar=new HashMap<>(),localStorage=new HashMap<>();',
  ' public static SharedPreferences preferences(String name){',
  '  Map<String,Integer> values=stores.computeIfAbsent(name,k->new HashMap<>());',
  '  return new SharedPreferences(){public int getInt(String key,int fallback){return values.getOrDefault(key,fallback);} public Editor edit(){return new Editor(){public Editor putInt(String key,int value){values.put(key,value);puts++;return this;} public void apply(){}};}};',
  ' }',
  ' public static void clear(boolean disk){if(!disk)throw new AssertionError("disk cache must be included");clears++;if(failClear)throw new IllegalStateException("synthetic cache failure");cached="fresh-bundle";}',
  ' public static void navigate(){navigations.add(cached);}',
  ' public static void clearCookies(){cookieJar.clear();} public static void clearStorage(){localStorage.clear();}',
  ' public static void main(String[] args){',
  '  String scenario=args[0]; int installed=187; boolean restored=false;',
  '  cookieJar.put("session","synthetic-account");localStorage.put("draft","unsynced-draft");',
  '  if(scenario.equals("same")){installed=190;cached="current-bundle";}',
  '  if(scenario.equals("restored")){restored=true;cached="restored-bundle";}',
  '  if(scenario.equals("missing"))installed=-1;',
  '  if(scenario.equals("qa")){BuildConfig.NATIVE_QA_WEBVIEW=true;installed=190;}',
  '  if(scenario.equals("cache-failure")||scenario.equals("cache-retry"))failClear=true;',
  '  if(scenario.equals("storage-wipe")){android.webkit.CookieManager.getInstance().removeAllCookies(null);android.webkit.WebStorage.getInstance().deleteAllData();}',
  '  if(installed!=-1)stores.computeIfAbsent(STORE,k->new HashMap<>()).put(KEY,installed);',
  '  boolean threw=false; try{new MainActivity().onCreate(restored?new Bundle():null);View.flush();if(scenario.equals("qa")){cached="old-bundle";new MainActivity().onCreate(null);View.flush();}}catch(IllegalStateException failure){threw=true;}',
  '  int firstStoredVersion=preferences(STORE).getInt(KEY,-1);int firstPuts=puts;',
  '  if(scenario.equals("cache-retry")){failClear=false;new MainActivity().onCreate(null);View.flush();}',
  '  String quote=Character.toString(34); List<String> values=new ArrayList<>();for(String value:navigations)values.add(quote+value+quote);',
  '  System.out.printf("{%cnavigations%c:[%s],%cclears%c:%d,%cputs%c:%d,%cstoredVersion%c:%d,%cthrew%c:%s,%caccountRetained%c:%s,%cfirstStoredVersion%c:%d,%cfirstPuts%c:%d}%n",34,34,String.join(",",values),34,34,clears,34,34,puts,34,34,preferences(STORE).getInt(KEY,-1),34,34,threw,34,34,"synthetic-account".equals(cookieJar.get("session"))&&"unsynced-draft".equals(localStorage.get("draft")),34,34,firstStoredVersion,34,34,firstPuts);',
  ' }',
  '}'
 ].join('\n')
};

function javaTool(name){
 const home=process.env.JAVA_HOME||process.env.JAVA_HOME_21_X64;
 return home?join(home,'bin',name+(process.platform==='win32'?'.exe':'')):name;
}
export function createActivityLoadProbe(activityPath){
 const parent=resolve(tmpdir()),root=mkdtempSync(join(parent,'sogrim-webview-load-')),classes=join(root,'classes');
 const close=()=>{assert.equal(dirname(resolve(root)),parent);rmSync(root,{recursive:true,force:true});};
 try{
  const files=[];
  for(const [path,source] of Object.entries(sources)){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,source+'\n');files.push(file);}
  const activity=join(root,'com/sogrimhashbon/app/MainActivity.java');writeFileSync(activity,readFileSync(activityPath));files.push(activity);mkdirSync(classes);
  const built=spawnSync(javaTool('javac'),['-J-Xmx128m','-J-XX:ActiveProcessorCount=1','--release','17','-encoding','UTF-8','-d',classes,...files],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(built.status,0,String(built.error||built.stderr||built.stdout));
  return {close,run(scenario){const r=spawnSync(javaTool('java'),['-Xmx64m','-XX:ActiveProcessorCount=1','-cp',classes,'com.sogrimhashbon.app.LoadProbe',scenario],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,String(r.error||r.stderr||r.stdout));return JSON.parse(r.stdout);}};
 }catch(error){close();throw error;}
}
