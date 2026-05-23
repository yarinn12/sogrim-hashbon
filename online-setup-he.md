# הכנה לבטא ציבורית

האפליקציה כבר יכולה לעבוד בשני מצבים:

- מצב מקומי: שמירה במחשב שלך דרך `data/app-state.json`.
- מצב בטא בענן: שמירה משותפת ב-Supabase דרך טבלת `app_snapshots`.

## מה צריך כדי לשלוח קישור לחברים

1. להקים פרויקט Supabase.
2. להריץ שם את `supabase/schema.sql`.
3. לפרוס את הפרויקט הזה ל-Vercel או לשרת שמריץ `node server.mjs`.
4. להגדיר את משתני הסביבה מתוך `.env.example`, או ליצור קובץ `.env` ליד `server.mjs`.
5. לבדוק שהכתובת `/api/health` מחזירה `shareLinksReady: true`.

## פריסה ל-Vercel

הפרויקט כולל `vercel.json`, כך ש-Vercel מריץ את `server.mjs` כ-Node handler.

משתני סביבה שצריך להגדיר בפרויקט ב-Vercel:

- `APP_SPACE_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GOOGLE_CLIENT_ID` רק כשמחברים Google אמיתי

אפשר להשאיר את `APP_PUBLIC_URL` ריק ב-Vercel; השרת יודע לזהות את הכתובת הציבורית מתוך הבקשה.

## משתנים חשובים

- `APP_PUBLIC_URL`: הכתובת הציבורית שהחברים פותחים.
- `APP_SPACE_ID`: מזהה פרטי לבטא, למשל `thursday-friends-2026`.
- `SUPABASE_URL`: כתובת פרויקט Supabase.
- `SUPABASE_ANON_KEY`: המפתח הציבורי של Supabase.
- `GOOGLE_CLIENT_ID`: יישאר ריק עד שנחבר כניסה אמיתית עם Google.

כשיש `APP_PUBLIC_URL`, `SUPABASE_URL` ו-`SUPABASE_ANON_KEY`, מסך הבית יסמן שהקישור מוכן לבטא עם חברים.

## זהות מקומית

הבחירה "מי אני עכשיו?" נשמרת בדפדפן של כל אחד בנפרד. המידע המשותף בענן שומר את האירועים, הקבוצות, המשתתפים וההוצאות, אבל לא מחליף זהות לכל החברים כשמישהו בוחר את עצמו.

## בדיקת בריאות

אחרי פריסה פתח:

`https://your-app.example.com/api/health`

אם `shareLinksReady` הוא `true`, הקישור באירוע אמור להיות קישור ציבורי שאפשר לשלוח לחברים.
