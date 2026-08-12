# בניית iOS והעלאה ל-TestFlight דרך GitHub Actions

ה-Workflow נמצא ב-`.github/workflows/ios-testflight.yml` ורץ ידנית בלבד.

לפני התקנת התלויות או התחלת בנייה, ה-Workflow בודק שכל המשתנים, המפתחות, תעודת ה-P12, הגרסה ומספר ה-Build תקינים. אם פרט חסר הוא נעצר מיד בלי לחשוף סוד בלוג. הסודות זמינים רק לשלבי Apple שצריכים אותם, ולא לפקודות ההתקנה או הבדיקות. רק הרצה אחת יכולה לפעול בכל רגע, כדי למנוע התנגשות בין שני Builds.

## מידע שיוזן לאחר הכניסה ל-Apple

GitHub Variables:

- `APPLE_TEAM_ID`
- `APPSTORE_ISSUER_ID`
- `APPSTORE_API_KEY_ID`

GitHub Secrets:

- `APPSTORE_API_PRIVATE_KEY` - תוכן קובץ ה-`.p8`, שניתן להוריד מ-Apple פעם אחת בלבד.
- `APPSTORE_CERTIFICATES_FILE_BASE64` - תעודת Apple Distribution בפורמט `.p12` כשהיא מקודדת Base64.
- `APPSTORE_CERTIFICATES_PASSWORD` - הסיסמה של קובץ ה-`.p12`.

אין לשמור מפתחות, תעודות או סיסמאות בקוד, ב-Git או בצילומי מסך.

מפתח ה-API צריך להיות Team API Key של App Store Connect עם הרשאת App Manager לפחות. אם הגישה ל-API טרם הופעלה, ה-Account Holder צריך לאשר אותה פעם אחת ב-App Store Connect.

## תעודת Apple Distribution בלי Mac

1. להריץ `npm run native:ios:csr`. קובץ ה-CSR ייווצר ב-`build/apple-signing` והמפתח הפרטי יישאר ב-Windows Certificate Store של המשתמש הנוכחי.
2. ב-Apple Developer ליצור תעודת Apple Distribution ולהעלות את קובץ ה-CSR.
3. להוריד את קובץ ה-`.cer` של Apple למחשב.
4. לקבוע סיסמה חזקה זמנית ולהריץ:

```powershell
$env:APPLE_P12_PASSWORD="סיסמה-חזקה-שנשמרת-במנהל-סיסמאות"
powershell -ExecutionPolicy Bypass -File scripts/export-apple-distribution-p12.ps1 -CertificatePath "C:\path\distribution.cer"
```

5. להעתיק את תוכן קובץ ה-Base64 שנוצר אל `APPSTORE_CERTIFICATES_FILE_BASE64`, ואת הסיסמה אל `APPSTORE_CERTIFICATES_PASSWORD` ב-GitHub Secrets.

התיקייה `build/apple-signing`, קובצי CSR, תעודות ו-P12 מוחרגים מ-Git. אין לשלוח אותם בוואטסאפ או במייל.

## מה ה-Workflow עושה

1. מאמת את הגדרות Apple ובוחר Xcode 26.6.
2. מריץ את בדיקות הפרויקט ומאמת שהאייקון אטום ובגודל הנדרש.
3. מכין את חבילת Capacitor ל-iOS בלי AdMob ובלי Push Notifications.
4. מגדיר את Team ID, הגרסה ומספר הבילד.
5. מתקין תעודת חתימה ו-Provisioning Profile.
6. בונה Archive באמצעות Xcode 26.6 ו-iOS 26.5 SDK.
7. מייצא IPA ומאמת לפני ההעלאה את החתימה, ה-Provisioning Profile, ה-Team ID, ה-Bundle ID, הגרסה, ה-Build, Universal Links ו-Sign in with Apple.
8. מעלה את ה-IPA המאומת ל-TestFlight.
9. שומר את ה-IPA, דוח הראיות ולוגי הבנייה כ-Artifact פרטי של GitHub למשך שבעה ימים, גם אם שלב מאוחר נכשל.

כל הרצה שהגיעה ל-Complete ב-App Store Connect חייבת לקבל מספר Build חדש בהרצה הבאה.
