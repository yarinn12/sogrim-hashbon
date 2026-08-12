# מוכנות ל-Google Play ול-App Store

עודכן: 3 באוגוסט 2026.

## מה כבר מוכן

- מזהה קבוע בשתי הפלטפורמות: `com.sogrimhashbon.app`.
- פרויקט Capacitor מלא ל-Android ול-iOS, כולל ניווט Native, שיתוף, חזרה וקישורי OAuth.
- Android מכוון ל-Android 16, API 36, כנדרש להגשות החל מ-31 באוגוסט 2026.
- שמירת ענן פעילה ב-Supabase, כניסה עם Google פעילה וחשבון נשמר בין מכשירים.
- מחיקת חשבון זמינה מתוך האפליקציה ובכתובת ציבורית `/account-deletion`.
- עמודי פרטיות, תמיכה, תנאים והצהרת נגישות זמינים בכתובות ציבוריות קבועות.
- App Privacy Manifest נוסף לפרויקט iOS ומצהיר על שם, אימייל, מזהה משתמש, מידע פיננסי אחר, תוכן משתמש ונתוני אבחון מצומצמים שנשלחים רק עם משוב.
- Sign in with Apple ו-Associated Domains הוגדרו בפרויקט iOS ברמת ה-entitlements.
- גרסת iOS הראשונה אינה כוללת את AdMob או Push Notifications עד שיוגדרו עבור Apple; כך אין SDK פרסום לא פעיל ואין רישום APNs שנשלח בטעות לשירות Android.
- Android כולל הגדרת חתימת Release קבועה, יצירת Upload Key ובניית AAB חתום.
- מפתח ההעלאה ל-Android נשמר גם בגיבוי מקומי מחוץ לפרויקט ואינו עולה ל-Git.
- קובץ `assetlinks.json` נוצר עבור קישורי Android מאומתים.
- בדיקות אוטומטיות מכסות חישובים, שמירת חשבון, מחיקה, קישורים, פרטיות ופרויקטי החנויות.
- בדיקת השחרור האחרונה עברה עם 945 מתוך 945 בדיקות, 16 מתוך 16 מסלולי מובייל, אימות זיכרון ענן מלא, בדיקת שני חשבונות חיים ובדיקת משוב ופרטיות.
- חבילת Android חתומה ועדכנית נמצאת ב-`android/app/build/outputs/bundle/release/app-release.aab`.

## פעולות שחייבות חשבון Google Play

1. לפתוח או לאמת חשבון Google Play Developer.
2. ליצור אפליקציה עם החבילה `com.sogrimhashbon.app` ולהפעיל Play App Signing.
3. להעלות את `android/app/build/outputs/bundle/release/app-release.aab`.
4. להעתיק מ-Play Console את טביעת ה-SHA-256 של App Signing ולהוסיף אותה לצד טביעת Upload Key בקובץ `.well-known/assetlinks.json`.
5. למלא את Data Safety לפי `docs/store-submission/google-play-data-safety-he.md`.
6. להזין את כתובת מחיקת החשבון: `https://sogrim-hashbon.vercel.app/account-deletion`.
7. אם זה חשבון אישי שנפתח אחרי 13 בנובמבר 2023, להריץ Closed Test עם 12 בודקים במשך 14 ימים רצופים.

## פעולות שחייבות Apple Developer ומחשב Mac

1. לפתוח או לאמת Apple Developer Program וליצור App ID עבור `com.sogrimhashbon.app`.
2. להפעיל Associated Domains ו-Sign in with Apple ל-App ID.
3. ליצור Services ID ומפתח Sign in with Apple, ולהגדיר אותם ב-Supabase.
4. להריץ `APPLE_TEAM_ID=XXXXXXXXXX npm run native:ios:association` ולהעלות את הקובץ שנוצר.
5. לפתוח את הפרויקט ב-Xcode 26 ומעלה, לבחור Team, ליצור Archive ולשלוח ל-TestFlight.
6. למלא App Privacy לפי `docs/store-submission/apple-app-privacy-he.md`.
7. לספק חשבון בדיקה פעיל והערות לבודק לפי `docs/store-submission/review-notes-he.md`.
8. למלא את App Store Connect לפי `docs/store-submission/apple-connect-checklist-he.md`.

## נכסי חנות

- אייקון iOS בגודל 1024x1024 כבר נמצא ב-Asset Catalog ללא שקיפות.
- אייקון Google Play בגודל 512x512 ו-Feature Graphic בגודל 1024x500 מוכנים.
- שלושה צילומי Google Play בגודל 1080x1920 מוכנים: אירוע, הוצאה והזמנה.
- שלושה צילומי App Store בגודל 1320x2868 מוכנים: אירוע, הוצאה והזמנה.
- כל חומרי ההעלאה והמקורות נמצאים ב-`docs/store-assets`.

## בדיקות אחרונות לפני Review

- התחברות Google, הרשמה באימייל ואיפוס סיסמה.
- Sign in with Apple במכשיר iPhone אמיתי.
- יצירת אירוע, הצטרפות בקישור וב-QR, הוספת הוצאה וסגירת חשבון.
- מחיקת חשבון והיעלמות ההיסטוריה האישית לאחר כניסה מחדש.
- פתיחת קישור הזמנה כשהאפליקציה סגורה וכשהיא פתוחה.
- בדיקת TalkBack ו-VoiceOver, טקסט מוגדל ומצב כהה/בהיר לפי התמיכה בפועל.

Push Notifications ופרסומות יתווספו ל-iOS בגרסה עתידית רק אחרי חיבור APNs/FCM והגדרת AdMob ופרטיות מלאה בצד Apple.

`GOOGLE_CLIENT_ID` ושמירת הענן כבר פעילים בפריסה החיה. ההגשה עצמה נשארת תלויה בחשבונות המפתחים, בטפסי החנויות ובבניית iOS חתומה על Mac.
