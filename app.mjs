# העלאה לרשת

האפליקציה הזו צריכה ריפו חדש ונפרד ב-GitHub. לא להשתמש בריפו של פרויקט אחר.

שם מומלץ לריפו: `settle-friends`

## GitHub

1. יוצרים ריפו חדש וריק ב-GitHub.
2. מעלים אליו את קבצי האפליקציה מהתיקייה הזו.
3. לא מעלים קבצי `.env`, תיקיית `.vercel`, תיקיית `data`, או קבצי ZIP מקומיים.

## Supabase

כדי שחברים יראו את אותו אירוע ויוכלו לערוך יחד, צריך Supabase:

1. יוצרים פרויקט Supabase.
2. מריצים את הקובץ `supabase/schema.sql` בתוך SQL Editor.
3. שומרים את `SUPABASE_URL` ואת `SUPABASE_ANON_KEY`.

## Vercel

1. ב-Vercel יוצרים Project חדש מהריפו החדש ב-GitHub.
2. מוסיפים Environment Variables:

```text
APP_SPACE_ID=settle-friends-beta
SUPABASE_URL=the-supabase-url
SUPABASE_ANON_KEY=the-supabase-anon-key
GOOGLE_CLIENT_ID=
```

`GOOGLE_CLIENT_ID` אופציונלי בשלב הבטא. אם הוא ריק, האפליקציה עדיין יכולה לעבוד עם זהות מקומית וקישורי הזמנה.

3. מפעילים Deploy.
4. אחרי הפריסה נכנסים לכתובת:

```text
https://your-vercel-domain.vercel.app/api/health
```

כשהכול תקין, הערכים של `publicUrlReady`, `cloudStorageReady`, ו-`shareLinksReady` צריכים להיות `true`.
