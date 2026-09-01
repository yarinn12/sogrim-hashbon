# Google Play Data Safety

## תשובות כלליות

- האפליקציה אוספת נתוני משתמש: כן.
- כל המידע מוצפן בזמן מעבר: כן, HTTPS בלבד.
- המשתמש יכול לבקש מחיקת מידע: כן.
- מחיקה מתוך האפליקציה: פרופיל > מחיקת חשבון.
- כתובת מחיקה חיצונית: `https://sogrim-hesbon-app.vercel.app/account-deletion`.
- המידע הפיננסי, השמות וכתובות האימייל אינם נמכרים ואינם נשלחים ל-AdMob לצורך התאמת מודעות.
- גרסת Android עשויה להציג מודעות לא-מותאמות אישית באמצעות Google AdMob. ה-SDK של Google עשוי לאסוף ולשתף כתובת IP, אינטראקציות עם האפליקציה, נתוני אבחון ומזהי מכשיר לצורכי פרסום, מדידה ומניעת הונאה.
- Supabase ו-Vercel פועלות כספקיות שירות לצורך אחסון, אימות ואירוח. Google פועלת כספקית פרסום כאשר מודעות מופעלות.

## סוגי מידע לסימון

| קטגוריה ב-Google Play | מה נאסף | מקושר למשתמש | חובה | שימוש |
|---|---|---:|---:|---|
| Personal info > Name | שם מלא | כן | כן | Account management, App functionality |
| Personal info > Email address | אימייל בהרשמה או Google | כן | כן | Account management, App functionality |
| Personal info > User IDs | מזהה חשבון ומזהה משתתף | כן | כן | Account management, App functionality, Security |
| Financial info > Other financial info | סכומי הוצאות, יתרות וחובות בין משתתפים | כן | לפי שימוש | App functionality |
| App activity > Other user-generated content | שמות אירועים, הוצאות, משתתפים, הערות, תמונות אירוע ותמונות קבלה או הוצאה שהמשתמש מעלה | כן | לפי שימוש | App functionality |
| App activity > App interactions | אירועים טכניים מצומצמים כמו פתיחת האפליקציה, יצירת אירוע או הוצאה, פתיחת סיכום ושיתוף הזמנה; ללא שמות או סכומים | כן, הבקשה מאומתת לחשבון | כן | Analytics, App functionality |
| App info and performance > Diagnostics | גרסת אפליקציה, פלטפורמה, מספר בנייה, כשלי פעולה ושגיאות לקוח מצומצמות; ללא תוכן אירוע או סכומים | כן, הבקשה מאומתת לחשבון | כן | Analytics, App functionality |
| Device or other IDs | אסימון התראות של Android המקושר לחשבון, יחד עם גרסת האפליקציה והעדפות התראה | כן | רק אם המשתמש מפעיל התראות | App functionality |
| Location > Approximate location | מיקום כללי שנגזר מכתובת IP על ידי Google Mobile Ads SDK | לא על ידי האפליקציה; עשוי להיות מקושר על ידי Google | לפי זכאות להצגת מודעה והסכמה | Advertising or marketing, Analytics, Fraud prevention |
| App activity > App interactions | הפעלות, הקשות ואינטראקציות עם מודעות הנאספות על ידי Google Mobile Ads SDK | עשוי להיות מקושר על ידי Google | לפי זכאות להצגת מודעה והסכמה | Advertising or marketing, Analytics, Fraud prevention |
| App info and performance > Diagnostics | נתוני ביצועים ואבחון נוספים של Google Mobile Ads SDK | עשוי להיות מקושר על ידי Google | לפי זכאות להצגת מודעה והסכמה | Analytics, Fraud prevention |
| Device or other IDs | Android Advertising ID, App Set ID ומזהי מכשיר רלוונטיים לפרסום | עשוי להיות מקושר על ידי Google | לפי זכאות להצגת מודעה, הגדרות המכשיר והסכמה | Advertising or marketing, Analytics, Fraud prevention |

אין לסמן Payment info: האפליקציה אינה מקבלת מספרי כרטיס, חשבון בנק או אמצעי תשלום ואינה מבצעת העברת כסף.

במסך השאלות של Contacts יש לסמן שהאפליקציה אינה אוספת אנשי קשר. אין הרשאת `READ_CONTACTS`, אין בוחר אנשי קשר ואין קריאה של פנקס הכתובות.

## שיתוף מידע

המידע הפיננסי ותוכן האירועים אינם משותפים עם רשת הפרסום. כאשר AdMob פעיל, יש להצהיר על איסוף ושיתוף הנתונים הטכניים שמפורטים בטבלה בהתאם למסמך הרשמי של Google Mobile Ads SDK. גם במודעות לא-מותאמות אישית עשויים להיעשות שימוש במזהי מכשיר לצורך הגבלת תדירות ודיווח מצטבר.

לפני כל הגשה יש להשוות מחדש מול:

- `https://developers.google.com/admob/android/privacy/play-data-disclosure`
- `https://support.google.com/admob/answer/7676680`

הצהרות Play Console חייבות להתאים לגרסת ה-SDK ולהגדרות AdMob בפועל בזמן ההגשה.
