# נקודת מסירה להעלאת iOS

עודכן: 3 באוגוסט 2026.

## הושלם מקומית

- Bundle ID קבוע: `com.sogrimhashbon.app`.
- גרסה 3.38, Build 61, iPhone בלבד ובמצב Portrait.
- אייקון App Store אטום בגודל 1024x1024 ושלושה צילומי 6.9 אינץ' אטומים בגודל 1320x2868.
- Privacy Manifest, Entitlements, Shared Xcode Scheme ו-Export Compliance.
- Sign in with Apple נתמך בקוד ומוכן להגדרה ב-Supabase.
- iOS אינו כולל AdMob או Push עד להגדרה מלאה עבור Apple.
- Workflow ידני לבנייה ב-Xcode 26.6 ולהעלאה ל-TestFlight.
- CSR תקין ל-Apple Distribution נמצא מקומית ב-`build/apple-signing/sogrim-hashbon-apple-distribution.csr`.
- חשבון חנות פרטי נבדק ומתחבר; הסיסמה נשמרת רק בקובץ המקומי המוחרג.
- מטא-דאטה, פרטיות, דירוג גיל, נגישות, הערות Review וצ'קליסט מילוי מוכנים תחת `docs/store-submission`.

## בדיקות אחרונות שעברו

- 945 מתוך 945 בדיקות יחידה ואינטגרציה.
- 16 מתוך 16 מסלולי מובייל: Android, iPhone, iPhone עם טקסט מוגדל ו-200% Reflow.
- זיכרון ענן, שני חשבונות חיים, סנכרון אירוע, משוב וגבולות פרטיות.
- 20 בדיקות iOS ייעודיות וכל בדיקות נכסי החנות.
- `npm audit --omit=dev`: אפס חולשות.

## תלוי בחשבון Apple

- ההרשמה והתשלום הושלמו ב-3 באוגוסט 2026. החשבון מוצג כעת כ-`Pending`; Apple מציינת שעיבוד הרכישה עשוי להימשך עד 48 שעות.

1. לוודא חברות פעילה ב-Apple Developer Program ולקבל Team ID.
2. ליצור App ID, Services ID ו-Key לפי `apple-sign-in-setup-he.md`.
3. להפעיל Apple Provider ב-Supabase ולבדוק כניסה על iPhone אמיתי.
4. ליצור Apple Distribution Certificate באמצעות ה-CSR המוכן, להוריד `.cer` ולייצא P12 בעזרת הסקריפט המוכן.
5. ליצור Team API Key ב-App Store Connect ולהזין את משתני וסודות GitHub.
6. ליצור רשומת אפליקציה ולמלא אותה לפי `apple-connect-checklist-he.md`.
7. לייצר ולהעלות את `apple-app-site-association` לאחר שנדע את Team ID, ואז לפרוס אותו ל-Vercel.

## GitHub

- הוגדר remote בשם `origin` ל-`https://github.com/yarinn12/sogrim-hashbon.git`.
- `origin/main` מכיל כרגע גרסה ישנה ומצומצמת, בעוד הפרויקט המקומי הוא הגרסה המלאה.
- לא בוצע Push כדי לא לדרוס את הריפו לפני סנכרון מכוון. לפני הפעלת Workflow ה-iOS צריך להעלות את הגרסה המקומית לענף מסודר, לאמת אותה ואז למזג ל-main.

## הפעולה הראשונה כשחוזרים

להיכנס ל-Apple Developer ול-App Store Connect. מיד לאחר שיש Team ID אפשר להשלים את קובץ הקישורים, Sign in with Apple, התעודה וה-Workflow ללא שינוי נוסף בלוגיקת האפליקציה.

לאחר השלמת ההגדרות יש להריץ:

```powershell
$env:APPLE_TEAM_ID="XXXXXXXXXX"
npm.cmd run qa:ios:review
```

הפקודה בודקת מול הייצור את Apple Provider, קובץ הקישורים האוניברסליים, דפי הפרטיות והתמיכה וחשבון ה-App Review הפרטי. שולחים ל-Review רק כאשר `ready` מחזיר `true` וכל הבדיקות ירוקות.
