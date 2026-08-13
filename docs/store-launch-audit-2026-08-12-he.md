# ביקורת מוכנות לחנויות - 12 באוגוסט 2026

המסמך מתאר את מצב קבצי ההשקה בפועל. הוא אינו מחליף בדיקה ידנית ב-Play Console או ב-App Store Connect.

## חסמי P0 לפני שליחה לחנויות

- [x] `https://sogrim-hashbon.vercel.app` ושרת הגיבוי מחזירים `200` עבור האפליקציה, דפי המדיניות וקבצי השיוך. פריסות Vercel חדשות עדיין חסומות ברמת החשבון ולכן Render נשמר כנתיב התאוששות.
- [x] Android AAB נבנה מחדש מהמקור המאוחד ב-13 באוגוסט 2026 ומאומת כגרסה `3.47 (70)`. פרטי הגרסה, הגודל, החתימה, SHA-256 וטביעת 523 קבצי המקור שמורים ב-`android/app/build/outputs/bundle/release/release-manifest.json`.
- [ ] להשלים Apple Developer Team ולהגדיר `APPLE_TEAM_ID`. אין Team ID ב-`ios/App/App.xcodeproj/project.pbxproj`.
- [ ] ליצור ולפרוס `.well-known/apple-app-site-association` באמצעות `npm run native:ios:association` לאחר קבלת Team ID.
- [ ] להפעיל Sign in with Apple ב-Apple Developer וב-Supabase ולוודא `npm run qa:ios:review` מול הסביבה החיה.
- [ ] לבנות ולחתום IPA באמצעות Xcode 26 ומעלה עם iOS 26 SDK על macOS, ולהעלות ל-TestFlight.
- [x] `npm test` ירוק: `1,032/1,032` בדיקות עוברות.

## Android - מוכן בקוד

- [x] Package קבוע: `com.sogrimhashbon.app` ב-`android/app/build.gradle` וב-`capacitor.config.json`.
- [x] גרסה נוכחית בקוד: `3.47 (70)` ב-`android/app/build.gradle`.
- [x] Target/Compile API 36 ו-Min API 24 ב-`android/variables.gradle`.
- [x] חתימת Upload קיימת ומוחרגת מ-Git: `android/keystore.properties`, `android/app/sogrim-upload-key.jks` ו-`.gitignore`.
- [x] טביעת AAB שנבדקה תואמת לתעודת ה-Upload: `D9:BE:...:74:1B`; התוקף עד 4 בדצמבר 2053.
- [x] Play App Signing fingerprint מתועד ב-`docs/store-submission/android-play-signing-certificate-sha256.txt` ונכלל ב-`.well-known/assetlinks.json`.
- [x] גיבוי, העברת נתוני מכשיר ו-cleartext כבויים ב-`AndroidManifest.xml` וב-`data_extraction_rules.xml`.
- [x] App Links מוגדרים ל-`/i/*`, `/r/*` ו-`/auth/callback`.
- [x] אייקון 512, Feature Graphic ושלושה צילומי חנות עוברים בדיקת ממדים.
- [x] Data Safety מתועד ב-`docs/store-submission/google-play-data-safety-he.md`.
- [x] `versionCode 70` גבוה מגרסת הבדיקה הפעילה `69` ומוכן להעלאה לאחר פתיחת שער ה-Production.
- [x] Google Play Billing והרשאת `com.android.vending.BILLING` אינם ארוזים בגרסת ההשקה. מסלול בתשלום יתווסף רק בגרסה עתידית לאחר החלטת מוצר והסדרה מתאימה.
- [ ] לוודא שהצהרת Ads ב-Play Console תואמת להתנהגות בפועל. AdMob ו-UMP ארוזים באפליקציה, אך הפעלה בייצור נשלטת מרחוק.
- [ ] לאמת ב-Play Console שה-Data Safety, Ads declaration, Content rating, App access ומדינות ההפצה תואמים לגרסה שתוגש.
- [ ] להריץ Pre-launch report על ה-AAB הסופי ולסגור כל Crash/ANR/חסימת מסלול.
- [x] `npm run qa:android-native` עבר על אמולטור Android 16 / API 36: ללא קריסה, גלישה אופקית, פקדים ללא שם או יעדי לחיצה קטנים מ-44px.
- [x] APK חתום במצב Release הותקן ונפתח באמולטור Android 16: גרסה `3.44 (67)`, עלייה קרה חוזרת ב-`1.917s`, מסך הכניסה הוצג במלואו ולא נרשמה `FATAL EXCEPTION`.
- [x] מדידת 10 פתיחות רצופות עברה `10/10`: חציון `1.903s`, ‏p75 של `2.093s`, ועומדת ביעד המוצר של `3s`. חריג יחיד של `10.587s` נשאר למעקב במכשיר פיזי.
- [ ] להשלים Smoke Test זהה על Release במכשיר Android פיזי לפני Production.

## iOS - מוכן בקוד

- [x] Bundle ID קבוע: `com.sogrimhashbon.app`.
- [x] גרסת ה-iOS והמטא-דאטה מסונכרנות על `3.38 (61)`.
- [x] `PrivacyInfo.xcprivacy` מצורף ל-Resources ומצהיר על שם, אימייל, User ID, מידע פיננסי אחר, תוכן משתמש ואבחון ללא Tracking.
- [x] `Info.plist` מצהיר `ITSAppUsesNonExemptEncryption=false` ומגביל iPhone ל-Portrait.
- [x] `App.entitlements` כולל Sign in with Apple ו-Associated Domains.
- [x] חבילות iOS כוללות רק App, Browser, Haptics ו-Share; לא נמצא שימוש ישיר ב-Required Reason API שאינו מתועד, ו-AdMob/Push אינם נארזים ב-iOS.
- [x] אייקון App Store אטום 1024x1024 ושלושה צילומי 1320x2868 עוברים בדיקה.
- [x] שם, Subtitle, תיאור, מילות מפתח, URLs והערות Review קיימים תחת `docs/store-submission`.
- [ ] לוודא ב-App Store Connect שהגרסה `3.38` וה-Build `61` גבוהים מהערכים שכבר קיימים. אין ליישר אוטומטית למספרי Android משום שכל חנות מנהלת רצף גרסאות נפרד.
- [ ] להשלים App Record, הסכמים, Tax/Banking אם Apple דורשת, DSA status, Content Rights, דירוג גיל החדש, App Privacy, Accessibility ופרטי Review ב-App Store Connect.
- [ ] להעלות Build חתום, לבדוק אותו ב-TestFlight על iPhone אמיתי ואז לבחור אותו בגרסת App Store.

## משפטי ו-URLs

- [x] קיימים מקומית: `privacy.html`, `terms.html`, `support.html`, `accessibility.html`, `account-deletion.html`.
- [x] עמוד מחיקת החשבון כולל מסלול בתוך האפליקציה וגם בקשה חיצונית במייל, עם זמן טיפול מוצהר.
- [x] מדיניות הפרטיות מפרטת Supabase, Vercel, Google/Apple, Firebase ו-AdMob.
- [ ] כל URL ציבורי חייב לחזור ב-HTTPS עם `200`, ללא Login וללא Redirect בעייתי, לפני הגשת חנות.

## אבטחה ונתוני אמת

- [x] הוחלו מיגרציות הקשחה לבעלות workspace, מרוץ בקשות חברות, חברות שרתית באירועים משותפים ותאימות למחיקת חשבון.
- [x] כל שלושת קובצי האימות החזירו `verification_status = ready`.
- [x] בדיקות ענן חיות עברו עבור זיכרון חשבון, שני חשבונות באירוע, חברים, הזמנות, התראות ומחיקת משתמשי QA.
- [x] נשמר גיבוי מקומי מוצפן לפני המיגרציה תחת `build/backups`, והוא מוחרג מ-Git.

## ארטיפקטים ותהליך Release

- `scripts/build-android-release.mjs` נועל בנייה מקבילית, מנקה פלט ישן, מריץ `bundleRelease` ו-`lintRelease`, מאמת את ה-Manifest המאוחד ואת תעודת ה-Upload, ומייצר `release-manifest.json` עם גרסה, SDK, גודל, SHA-256 וטביעת מקור.
- `scripts/verify-store-readiness.mjs` מפריד בין מוכנות מקומית, שירותים חיים וחסמים ידניים; הוא מאמת שה-AAB והראיות תואמים בדיוק לגרסה ולמקור הנוכחיים.
- `scripts/verify-ios-submission.mjs` אינו מאשר iOS כאשר Team ID או AASA חסרים.
- `scripts/verify-ios-artifact.mjs` רץ על macOS לאחר יצוא ה-IPA ומאמת חתימה, Bundle ID, גרסה, Build, Provisioning Profile, Associated Domains ו-Sign in with Apple לפני העלאה ל-TestFlight.
- `.github/workflows/ios-testflight.yml` משתמש בגרסאות הפעולות העדכניות שהוגדרו (`download-provisioning-profiles@v6`, `import-codesign-certs@v7`, `upload-testflight-build@v5`) ושומר גם דוח ראיות חתום.
- `npm run qa:store` מחזיר כעת `localReady: true`, אך `liveReady: false` ו-`submissionReady: false` בגלל האתר וקונסולות החנויות.
- [x] מועמד ההשקה מקובע ב-commit `a422770` בענף `codex/launch-readiness` ודחוף ל-GitHub, ללא שינויים מקומיים פתוחים.
- [ ] ליצור תג גרסה לפני Production. טביעת המקור מאפשרת לזהות בדיוק את הקבצים שמהם נבנה ה-AAB, וה-commit הנקי מאפשר שחזור מלא של המקור.
- [ ] לשמור מחוץ לריפו גיבוי מוצפן של Android upload key, תעודת Apple ומפתחות App Store Connect.

## פקודות שער

1. `npm test`
2. `npm run native:prepare`
3. `npm run native:android:release`
4. `npm run qa:store`
5. `npm run qa:android-native`
6. `npm run qa:android-benchmark`
7. `npm run qa:ios`
8. `npm run qa:ios:artifact` על macOS לאחר יצוא IPA חתום
9. `npm run qa:ios:review` לאחר חזרת האתר ו-Sign in with Apple

Release מועמד מוכן רק כאשר כל פקודות השער עוברות והסעיפים הידניים בחנות מתועדים בצילום או בדוח.
