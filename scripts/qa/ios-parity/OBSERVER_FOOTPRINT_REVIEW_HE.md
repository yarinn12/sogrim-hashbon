# אבחון השפעת ה־observer על אתחול iOS475

היעד הוא לברר עיכוב אתחול, ללא שינוי מוצר או קבלת הפצה. האפליקציה קפואה ב־8b8bfa6da7fc88e7e846c894d26b59120c871468, והמכשור המקורי ב־5115472ada3f5661d4aa81a23d9a38eb6529b44f; tree11c02930f0312b030b90f78d104ded8acfad60f0. התזמור החדש נמצא ב־checkout שלישי וזהותו נמדדת בכל ריצה.

## אימות לפני הפעלה

Root אימת את patch Apple המקורי:96915 בתים, SHA25696d6c18d8fe9eb87246d9fc6886b176bff114cb608f874f822bd1bdb0b85ed9e. baseline50קובצי מקור/214נכסיWWW/18קובצי מכשור זהה ל־manifest בארכיון475 המקורי artifact12007329912, SHA2561aaa9f8fc53da1577e509e7993a244152f3dbf6b44931bf4d20fdae6f0b8c9eb. כל68בתיהמקור/מכשור אומתו מולGit; checkout אמיתי של5115472 נדרש גם ב־CI.

הכנהb05d42cd עברה16בדיקות ממוקדות ו־3992רגילות:9בשלבJava ו־3983בשלב הנוסף, ללא כשל/דילוג. QA סגר סקירה עצמאית. OLD מבודד מוכיח שטענת ארבע יצירות ללא תנאי ושמיטת החזרת כשל לאחרpersist נדחות. שינוי ההפעלה מצומצם לשני מנעוליworkflow, בדיקתם והתיעוד. Vercel preview חסום בענף האבחון בלבד.

## ניסוי חד־פעמי

הענףcodex/ios475-observer-footprint-abba-20261016 יוצר push/run_number1/attempt1 בלבד. macos-26 רגיל, Xcode26.6 וארבעהiPhone16/iOS26.5 חדשים בבעלות הריצה. A/B/B/A: ניטור חיצוני מקורי מופעל/כבוי/כבוי/מופעל. בנייתunsigned אחת משמשת בכל הזרועות, עם inventory והשוואת כל קובציProducts לפני ואחרי. כלpublic חייב להתאים ל־218הנכסים המקוריים, כולל4fixtureJS.

כל זרוע מתחילה בכיבוי/erase/boot/bootstatus שלUDID מאומת. איןprewarm, AX, מכשיר חלופי אוretry. XCTest, observer, אפליקציה ותקציבים פנימיים נשארים מקוריים, כולל המתנת35שניות. outer195דקות מכיל buildעד35 וארבע זרועותעד35, הכנה וסגירה; אינו מאריך deadline פנימי.

## ראיות וכשל

פקודות שומרות args/PID/UTC/monotonic/exit/signal ולוגים. XCTest ו־observer כותבים ישירות לקבצים. נשמריםxcresult/attachments, journal/captures/ACK/PNG, monitor-report ו־rawtimeouts, SDK, מוצרי הבנייה ו־creationProof של כלsimctl create עם receipt וקריאת זהות במצבShutdown. preflight חלקי אינו טוען לארבעה מכשירים.

collect/inspect/after/cleanup מתבצעים גם בכשל. ה־row נשמר לפני החזרת שגיאה לצעדCI; continue-on-error מאפשר לזרועות הבאות לשמר תוצאות משלהן. הסיכום משאיר ארבע שורות, גם אם זרוע חסרה, ומפריד valid negative initialWait מתוצאה שאינה תקפה להשוואה. אין אימוץ מכשיר לפי שם, כיבוי כל הסימולטורים או מחיקת מכשירים. hard cancellation שלhost עשויה למנוע סגירה סופית; קידומות נשמרות ככל ש־GitHub מאפשר.

producer startMs שלperformance.mark, delivery monotonicMs שלPerformanceObserver, native receipt ופרסום ראשון מוצגים בנפרד. first-screen-rendered אינו הוכחתpaint; home-wait-ready הוא poll. ב־475 נמדדוauth25521 לעומתdelivery37448 ו־double-rAF producer7876ms. הסיבה טרם הוכחה. תוצאותobserver unavailable/sample-timeout הן טיפולON עם מגבלה גלויה, ולא הוכחתstacksample תקין.

זהו אבחוןdefault בלבד עלhost אחד. המאמת המלא הדורש26captures/שני גדלים אינו מוחלף. QA475 נותר כושל; nativeAcceptance/sourceAccepted/distributionAllowed נשאריםfalse תמיד. אין מפתחות, חתימה, העלאה, חנויות, מסד, הפצת אתר אוautomation. גם היעדר שחזור אינו מוכיח תיקון.
