# סוגרים חשבון — טלאי מבודד ל־Android Native QA עם 4096 MiB

12 באוקטובר 2026. הטלאי [0001-Use-4-GiB-guest-RAM-for-Android-Native-QA.patch](0001-Use-4-GiB-guest-RAM-for-Android-Native-QA.patch) הוכן על בסיס המקור המקומי `71857d494cdc9648085b71d34310228379475153`. הוא שמור גם כ־commit מקומי `00f778f25d862794ecdef65a14783a745c9d135b` בענף `codex/android-native-4096-baseline-20261012`. לא בוצעו push, ‏CI או פרסום.

## שינוי מדויק

קובץ יחיד השתנה: `.github/workflows/android-native-parity-qa.yml` (`+13/−2`). ה־AVD של Pixel 6 כותב כעת `hw.ramSize = 4096` ל־`config.ini`, והאמולטור מופעל עם `-memory 4096`. לאחר כתיבת ה־AVD, ה־workflow מאמת את השורה ושומר `avd-resources.txt`. לאחר boot הוא קורא את `/proc/<emulator.pid>/cmdline`, מאמת שפקודת האמולטור הפעיל מכילה `-memory 4096 -cores 2`, ושומר `emulator-cmdline.txt`. `guest-meminfo.txt` ו־`host-meminfo.txt` נשמרים כראיות, ושורות `MemTotal` שלהן מודפסות ללוג **כאבחון**, ללא סף זיכרון חדש.

לא שונו שתי ליבות ה־guest, ‏SDK/image ‏Android 36.1, ‏`-gpu software`, תכונות ה־renderer, מסך 1080×2400@420, גבול 45 הדקות, זמני המתנה או קוד מוצר. ה־workflow הרגיל עדיין מריץ `acceptance.mjs` המלא: ששת תאי המטריצה, pages ו־journey, כולל IME אמיתי, ‏ACK והפעלה מחדש. נשארו גם בקרות font/geometry, בדיקות בריאות לפני ואחרי, איסוף trace וה־ANR guard שנכשל על ANR של האפליקציה גם לאחר התאוששות. העלאת ראיות ה־workflow הרגיל לא הוסרה.

## ראיות להחלטת הכיול

- [ריצת OLD ‏38290746842](https://github.com/yarinn12/sogrim-hashbon/actions/runs/38290746842), [job Android Native](https://github.com/yarinn12/sogrim-hashbon/actions/runs/38290746842/job/114950536331): על מקור האפליקציה `eaecfa0761aa80b3701b329b30393899510d6844`, אמולטור Pixel 6 עם 2048 MiB, שתי ליבות ו־software GPU רשם ANR אמיתי של `com.sogrimhashbon.app.debug` בזמן השקה לפני סיבוב בתא `1.5× portrait`. ניתוח ה־Perfetto התמקד ב־`WebViewFunctor::drawGl` למשך 5.145 שניות, בלי להוכיח גורם שורש.
- [ניסוי RAM ‏38297030336](https://github.com/yarinn12/sogrim-hashbon/actions/runs/38297030336), אותו מקור אפליקציה: [זרוע 2048 MiB](https://github.com/yarinn12/sogrim-hashbon/actions/runs/38297030336/job/114970479734) נכשלה בתא `2× landscape` בזמן המתנה ל־Activity לפני סיבוב; `MemTotal` ב־guest היה 2,014,496 KiB ו־ANR guard החזיר `historyReady:false`. שש שורות ANR בלוג אינן שש תקריות מוכחות. [זרוע 4096 MiB](https://github.com/yarinn12/sogrim-hashbon/actions/runs/38297030336/job/114970480205) עברה את כל ששת התאים עם `MemTotal` ‏4,009,488 KiB, ללא שורות ANR של האפליקציה; בקרות font/geometry ובריאות עברו. שתי הזרועות לכדו trace, אך ה־Trace Processor לא ניתח אותו, והניסוי לא הפעיל acceptance מלא. ה־APK נבנה בנפרד בכל זרוע.
- [מפרט Google ל־Pixel 6](https://support.google.com/pixelphone/answer/7158570?hl=en) מציין 8 GB ‏LPDDR5 RAM במכשיר האמיתי. לכן 4096 MiB הם baseline שמרני לאמולטור של דגם זה; זו בחירת כיול לסביבת הבדיקה, לא סף תמיכה במוצר.

**גבול ההסקה:** ההבדל בין זרועות הניסוי תומך ברגישות של בדיקת ה־CI ל־RAM אך אינו מוכיח ש־RAM הוא גורם ה־ANR או שהאפליקציה תקינה במכשיר עם 2 GB. ה־ANR בתצורת 2 GB נשאר מתועד ככשל של האפליקציה בסביבת הניסוי, ולא סונן או סווג ככשל זר. הטלאי אינו תיקון מוצר ואינו אישור שחרור.

## אימות מקומי ומסירה

- `git diff --check` עבר; מקור `71857d4` נשאר נקי, והעץ המבודד נקי אחרי commit. `git apply --check` של הטלאי על מקור `71857d4` עבר.
- הרצה מבוקרת של בלוק Python ליצירת `config.ini` על fixture זהה נתנה `hw.ramSize = 2048` בקוד הישן ו־`hw.ramSize = 4096` בטלאי. אומתו גם נוכחות בדיקות הקריאה החוזרת ב־workflow ונוכחות שלבי acceptance/ANR/trace. האסרטציות החדשות ירוצו כחלק ממסלול Android Native הרגיל לאחר השילוב.
- לא הורץ אמולטור או acceptance מלא על הטלאי המקומי; ה־Root יריץ סבב מלא על מקור משולב חדש. בדיקת תחביר Bash מקומית דרך Git Bash נחסמה בסנדבוקס Windows (`NtCreateDirectoryObject ... 0xC0000022`), ולכן אין לייחס לה אישור או כשל workflow. אימות GitHub YAML עדיין ממתין להרצה שם.

אפשר לשלב את commit `00f778f` ב־cherry-pick מתוך אותו Git repository, או להחיל את קובץ הטלאי על `71857d4`. SHA-256 של הטלאי: `3B25DA52F7A8F2AA350C5E9FAB5BBCFB2F6AD2871EF540C8EBC531D0DDD4C4CF`.
