# הכנת אימייל לאימות חשבון ולאיפוס סיסמה

## מצב נוכחי

- אימות כתובת אימייל מופעל ב־Supabase (`mailer_autoconfirm=false`).
- כתובת האתר הראשית של Auth היא `https://sogrim-hesbon-app.vercel.app`.
- רשימת ההפניות כוללת את האתר החדש ואת callback ה־native, בלי למחוק כתובות קיימות.
- מסלול איפוס הסיסמה עבר בדיקה חיה: קישור Recovery, החלפת סיסמה, דחיית הסיסמה הישנה וכניסה עם החדשה.
- SMTP מותאם עדיין אינו מחובר. שרת המייל המובנה של Supabase מיועד לבדיקה בלבד ואינו מתאים למשתמשי Production.

## מה נדרש לפני פתיחת הרשמה באימייל לציבור

1. לרכוש או לחבר דומיין בשליטת המוצר. כרגע אין דומיין מותאם בפרויקט Vercel.
2. לבחור ספק מייל טרנזקציוני שתומך ב־SMTP, למשל Resend, Postmark, Brevo, SendGrid או AWS SES.
3. ליצור תת־דומיין ייעודי לאימות, לדוגמה `auth.example.com`, ולהגדיר אצל ספק ה־DNS את רשומות SPF, DKIM ו־DMARC של הספק.
4. ב־Supabase לפתוח Authentication > Emails > SMTP Settings ולהפעיל Custom SMTP.
5. להזין Host, Port, Username, Password, כתובת שולח ושם שולח. אין לשמור את הסיסמה בקוד או ב־Git.
6. ב־Authentication > Rate Limits להתאים את מגבלת שליחת המיילים לנפח ההשקה.
7. לבצע הרשמה ואיפוס סיסמה לכתובת בדיקה אמיתית, לבדוק Inbox ו־Spam, ולוודא שהקישור חוזר לאתר החדש.
8. רק אחרי בדיקת המסירה להגדיר ב־Vercel Production את `AUTH_EMAIL_DELIVERY_READY=true` ולהריץ `npm run qa:production:strict`.

## בדיקות מוכנות

- `npm run qa:auth-live` בודקת את פרוטוקול האימות והאיפוס בלי להשאיר משתמשי בדיקה.
- `npm run qa:production:strict` נכשל כל עוד `AUTH_EMAIL_DELIVERY_READY` אינו מופעל, כדי שלא נסמן את ההשקה כמוכנה בלי SMTP אמיתי.
- בדיקת Production מאמתת גם שספק email/password פעיל ושאימות כתובת לא כובה.

## הערת אבטחה

אין להשתמש באותו דומיין או באותו שולח לקמפיינים שיווקיים ולמיילי אימות. מיילי Auth צריכים להיות קצרים, ללא תוכן משתמש, וללא מנגנון click tracking שעלול לשנות קישורים חד־פעמיים.
