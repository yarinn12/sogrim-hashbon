# מעבר לדומיין ציבורי עצמאי

## מטרה

כל קישור שנשלח למשתמש יישאר תקף גם אם מחליפים את Vercel ב-Render או בספק
אחר. הדומיין יהיה הכתובת הקבועה; ספק האירוח יהיה רכיב שניתן להחלפה.

## לפני המעבר

1. רוכשים דומיין אצל רשם שאינו Vercel או Render.
2. מנהלים DNS במקום עצמאי. אפשר להשתמש ב-Cloudflare DNS ללא העברת הקוד אליו.
3. בוחרים כתובת אחת לאפליקציה, לדוגמה `https://app.example.co.il`.
4. משאירים את `sogrim-hesbon-app.vercel.app` פעיל לפחות שישה חודשים עבור גרסאות
   ישנות וקישורים שכבר נשלחו.

## שינויי תצורה

- `APP_PUBLIC_URL` ב-Vercel וב-Render מקבל את הדומיין החדש.
- Google OAuth ו-Supabase Auth מקבלים redirect מורשה ל-`/auth/callback`.
- Android Manifest מקבל את host החדש עבור `/i/`, `/r/` ו-`/auth/callback`.
- iOS entitlements מקבל `applinks:<host>`.
- קובצי `assetlinks.json` ו-`apple-app-site-association` מוגשים מהדומיין החדש
  ללא redirect.
- כתובות פרטיות, תמיכה, שיווק ומחיקת חשבון בחנויות מוחלפות יחד.
- מטא-דאטה של WhatsApp/Open Graph מצביע לתמונה באותו דומיין.

## שער מעבר

לפני Android:

```powershell
$env:APP_PUBLIC_URL='https://app.example.co.il'
npm.cmd run qa:public-origin
```

לפני iOS:

```powershell
$env:APP_PUBLIC_URL='https://app.example.co.il'
npm.cmd run qa:public-origin:ios
```

שני השערים חייבים לעבור לפני העלאת build שמייצר קישורים בדומיין החדש.

## סדר פריסה בטוח

1. מעלים את אותו release ל-Vercel ול-Render.
2. בודקים `/api/health`, דפי מדיניות, הזמנה פרטית וכניסה בשני הספקים.
3. מכוונים את הדומיין ל-Vercel ומריצים את שער הייצור.
4. מפרסמים Android rollout מדורג ומוודאים App Links במכשיר אמיתי.
5. מפרסמים iOS דרך TestFlight ומוודאים Universal Links.
6. מבצעים תרגיל DNS ל-Render, בודקים הזמנה וסנכרון, ומחזירים לשרת הראשי.

אין למחוק את כתובות הספק הישנות במהלך תקופת התאימות.
