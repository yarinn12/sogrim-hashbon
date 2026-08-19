# Runbook: הקשחת Supabase לקראת השקה

## מטרה והיקף

המיגרציה `20260812150007_harden_workspace_claims_and_friendship_requests.sql` סוגרת שלושה סיכונים:

1. משתמש חדש אינו יכול לקבל בעלות על snapshot קיים רק באמצעות `raw_user_meta_data` שבשליטתו.
2. ידיעת המפתח של מרחב אישי אינה מספיקה לעדכון שלו; רק בעל החשבון יכול לעדכן מרחב עם `owner_user_id`.
3. שתי בקשות חברות הדדיות בו-זמנית ננעלות לפי אותו זוג משתמשים ולא יוצרות מרוץ כתיבה.

המיגרציה אינה מבצעת backfill אוטומטי. בפרט, אסור להכניס לטבלת ה-claims אירוע משותף רק משום ש-`owner_user_id` שלו ריק.

## קבצים

- מיגרציה: `supabase/migrations/20260812150007_harden_workspace_claims_and_friendship_requests.sql`
- אימות: `supabase/verification/verify_20260812150007_security_hardening.sql`
- rollback שמרני: `supabase/rollbacks/20260812150007_harden_workspace_claims_and_friendship_requests_safe.sql`

## לפני ההחלה

1. לקבוע חלון שינוי קצר ולוודא שיש גיבוי מסד עדכני ב-Supabase.
2. לא להריץ את `scripts/apply-supabase-schema.mjs` על production. מעכשיו production מתקדם באמצעות migrations בלבד.
3. לבדוק שה-CLI מחובר לפרויקט הנכון:

```powershell
npx supabase --version
npx supabase migration list --linked
```

4. לבדוק את המיגרציה בלי להחיל:

```powershell
npx supabase db push --linked --dry-run
```

הפלט צריך לכלול רק את גרסת `20260812150007`. אם מוצגות מיגרציות נוספות, עוצרים ומיישרים היסטוריה לפני המשך.

5. לשמור ספירות baseline בלי להדפיס מפתחות או state מלא:

```sql
select count(*) as snapshots_total,
       count(*) filter (where owner_user_id is null) as ownerless_total,
       count(*) filter (where owner_user_id is not null) as owned_total
from public.app_snapshots;

select count(*) as friendships_total,
       count(*) filter (where status = 'pending') as pending_total,
       count(*) filter (where status = 'accepted') as accepted_total
from public.friendships;
```

## החלה

יש להפעיל מפעיל אחד בלבד:

```powershell
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db query --linked --file supabase/verification/verify_20260812150007_security_hardening.sql
```

האימות חייב להסתיים בשורה שבה `verification_status` הוא `ready`. כל חריגה נחשבת ככישלון rollout.

## בדיקות עשן אחרי ההחלה

1. חשבון קיים טוען ושומר את המרחב האישי שלו.
2. חשבון אחר עם מפתח ידוע אינו יכול לעדכן מרחב אישי שאינו בבעלותו.
3. אירוע משותף קיים עדיין נטען ונשמר על ידי משתתף מחובר.
4. הרשמה חדשה יוצרת מרחב אישי חדש ונשמרת לאחר יציאה וכניסה.
5. שתי בקשות חברות הפוכות מסתיימות בקשר יחיד במצב `accepted`.
6. ספירות ה-snapshots וה-friendships אינן קטנות מה-baseline ללא הסבר צפוי.

אין לבצע בדיקת takeover על נתוני משתמש אמיתיים. לחשבון בדיקה יוצרים snapshot זמני ומוחקים אותו בסיום.

## claims למרחב ישן

ברירת המחדל היא לא ליצור claim. Claim נועד רק למרחב אישי ישן שאומת באופן עצמאי לפני יצירת החשבון. זיהוי לפי metadata או ידיעת מפתח בלבד אינו אימות מספיק.

אם נדרש claim כזה, מפעיל מסד מוסמך יוסיף ידנית את `snapshot_id` ואת `access_key_hash` שכבר שמור ב-snapshot. אין לשמור או לשלוח את המפתח הגולמי. אחרי ההרשמה ה-trigger צורך את הרשומה ומוחק אותה.

## rollback

ה-rollback השמרני מסיר רק את מנגנון ה-claim. הוא נעצר אם קיימים claims ממתינים, ואינו מחזיר את מדיניות העדכון הפגיעה או את מרוץ בקשות החברות.

```powershell
npx supabase db query --linked --file supabase/rollbacks/20260812150007_harden_workspace_claims_and_friendship_requests_safe.sql
npx supabase migration repair 20260812150007 --linked --status reverted
```

לאחר rollback יש לעצור deploy אוטומטי, אחרת `db push` הבא יחיל שוב את המיגרציה. שיוכי בעלות שכבר הושלמו אינם מבוטלים אוטומטית, משום שהחזרת `owner_user_id` ל-`null` עלולה לחשוף או לאבד מידע.

## הרשאות לאירועים משותפים

המיגרציה `20260812151750_enforce_shared_event_membership.sql` סוגרת את הסיכון שבו משתתף שהוסר ממשיך לכתוב בעזרת מפתח ישן:

1. `app_snapshots.snapshot_kind` מבדיל בין workspace אישי לבין `shared_event`.
2. `private.shared_snapshot_members` שומרת חברות פעילה או מוסרת לפי `auth.uid()` והמשתתף הקבוע `account-<uuid>`.
3. `public.join_shared_event(text)` צורך את מפתח ההזמנה מהכותרת, רושם משתמש חדש באופן אידמפוטנטי ומסרב להחזיר משתמש שסומן `removed`.
4. מדיניות `app_snapshots_update` מאפשרת כתיבה לאירוע משותף רק כאשר קיימת חברות פעילה. לצורך תאימות לגרסה שכבר מותקנת קיים bootstrap חד־פעמי לחשבון שלא נרשם עדיין ושלא סומן כמוסר; לאחר השמירה הראשונה המפתח לבדו אינו מספיק עוד לכתיבה.
5. טריגר לפני עדכון מונע ממשתמש רגיל לשנות חברות או למחוק אירוע. מנהל יכול להסיר, לקדם או להחזיר חבר; חבר רשאי לעזוב את עצמו כאשר נשאר מנהל אחר.
6. טריגר לאחר עדכון מסנכרן תפקידי מנהל ואת סטטוס ההסרה באותה טרנזקציה של שמירת האירוע.

### סדר פריסה

אין להפעיל את `scripts/apply-supabase-schema.mjs` על production. מפעיל יחיד מבצע:

```powershell
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

ה־dry run חייב להציג, לפי הסדר, רק את המיגרציות שטרם הוחלו:

- `20260812150007_harden_workspace_claims_and_friendship_requests.sql`
- `20260812151750_enforce_shared_event_membership.sql`

לאחר גיבוי וחלון שינוי:

```powershell
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db query --linked --file supabase/verification/verify_20260812150007_security_hardening.sql
npx supabase db query --linked --file supabase/verification/verify_20260812151750_shared_event_membership.sql
```

שני קובצי האימות חייבים להחזיר `verification_status = ready`.

### תאימות לאירועים קיימים

המיגרציה מסווגת snapshots קיימים לפי מבנה האירוע, אך אינה מנחשת זהות חשבון מתוך שם. לכן אירוע ישן עשוי להופיע במונה `legacy_shared_snapshots_awaiting_first_member`. המשתמש המחובר הראשון ששומר אותו נרשם דרך RPC עם המפתח הקיים. אם המשתתף כבר נמצא ב־`inactiveParticipantIds`, ההצטרפות נחסמת.

בדיקות עשן נדרשות בחשבונות QA בלבד:

1. מנהל ומשתתף מחובר עורכים הוצאה והעדכון מופיע בשני המכשירים.
2. המנהל מסיר את המשתתף; שמירה נוספת מהמכשיר שהוסר נדחית גם אם הקישור והמפתח נשמרו בו.
3. משתמש חדש עם קישור תקין מצטרף ומבצע שמירה אחת.
4. משתמש רגיל אינו יכול להסיר אדם אחר, לקדם מנהל או למחוק את האירוע באמצעות בקשת API ידנית.
5. אירוע אישי ו־workspace בבעלות החשבון ממשיכים להיטען ולהישמר.

### נסיגה

`supabase/rollbacks/20260812151750_enforce_shared_event_membership_safe.sql` משחזר זמנית כתיבה לפי מפתח ומסיר את טריגרי האכיפה, אך משאיר את `snapshot_kind` ואת היסטוריית החברות כדי לא לאבד נתונים. הנסיגה פותחת מחדש את סיכון המשתמש שהוסר, ולכן מיועדת רק לאירוע production קצר עד roll-forward מתוקן.

### מצב נוכחי

המיגרציות `20260812150007` ו־`20260812151750` הוחלו בענן ב־12 באוגוסט
2026 ושני קובצי האימות החזירו `verification_status = ready`.

בבדיקת ההתראות שלאחר ההחלה זוהתה התנגשות בין שומר האירועים לבין אנונימיזציית
מחיקת חשבון. המיגרציה
`20260812185000_allow_guarded_account_deletion_anonymization.sql` מתקנת זאת
באופן מצומצם: היא מתירה רק שינוי מקונן שמחליף את פרטי המשתמש שנמחק בתוך מערך
המשתתפים, ללא שינוי באירוע, בהוצאות, בהעברות או בחברות. גם האימות שלה החזיר
`ready`.

לאחר התיקון עברו בדיקות אמת לחשבונות זמניים: זיכרון חשבון, שני חשבונות באירוע,
חברים, הזמנות, תיבת התראות ומחיקת משתמשי ה־QA. הגיבוי המוצפן שנוצר לפני השינוי
נמצא מקומית תחת `build/backups` ואינו נכלל ב־Git.

## נעילת הוצאות באירוע סגור

ב־19 באוגוסט 2026 הוחלה המיגרציה
`20260819213000_enforce_locked_event_expenses.sql`. היא מוסיפה טריגר נפרד
שאוסר שינוי של `expenses` או `deletedExpenses` כאשר האירוע כבר נעול, גם אם
הכותב הוא מנהל. פתיחת האירוע מחדש ומחיקת אירוע שלם נשארות פעולות נפרדות.

לפני ההחלה אומתו כל 13 השינויים הקודמים מול סכמת production, היסטוריית
`supabase_migrations` יושרה, ו־dry run הציג רק את המיגרציה החדשה. לאחר ההחלה
הקובץ `verify_20260819213000_locked_event_expenses.sql` החזיר `ready`, והטריגר
נמצא פעיל עם הרשאות `EXECUTE` חסומות ל־`anon` ול־`authenticated`.

נסיגה שמרנית זמינה בקובץ
`supabase/rollbacks/20260819213000_enforce_locked_event_expenses_safe.sql`.
יש להשתמש בה רק אם פתיחת אירוע מחדש אינה פותרת תקלה תפעולית, ולאחר מכן לסמן
את גרסת המיגרציה כ־`reverted` בהיסטוריה.
