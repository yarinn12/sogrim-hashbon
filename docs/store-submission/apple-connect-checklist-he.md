# צ'קליסט App Store Connect

המסמך מרכז את הערכים שכבר הוכנו ואת הפעולות שנשארו לאחר הכניסה לחשבון Apple.

## 1. Identifiers

- ליצור Explicit App ID בשם `סוגרים חשבון`.
- Bundle ID: `com.sogrimhashbon.app`.
- להפעיל `Sign in with Apple` ו-`Associated Domains`.
- ליצור Services ID בשם `סוגרים חשבון Web` עם המזהה `com.sogrimhashbon.app.web`.
- את הדומיין, כתובת החזרה והגדרת Supabase להעתיק מ-`apple-sign-in-setup-he.md`.

## 2. פתיחת האפליקציה

ב-App Store Connect לבחור My Apps > New App ולהזין:

- Platforms: iOS.
- Name: `סוגרים חשבון`.
- Primary Language: Hebrew.
- Bundle ID: `com.sogrimhashbon.app`.
- SKU: `SOGRIM-HASHBON-IOS-001`.
- User Access: Full Access.

אם השם אינו פנוי, לא משנים Bundle ID. עוצרים ובוחרים יחד שם חנות חלופי בלבד.

## 3. App Information

- Subtitle: `התחשבנות חכמה בין חברים`.
- Primary Category: Finance.
- Secondary Category: Productivity.
- Content Rights: האפליקציה אינה מכילה תוכן צד שלישי שמחייב זכויות הפצה.
- Age Rating: למלא לפי `apple-age-rating-he.md`.
- App Accessibility: להכין Draft לפי `apple-accessibility-he.md` ולפרסם רק יכולות שעברו אימות על iPhone אמיתי.

## 4. App Privacy

- Privacy Policy URL: `https://sogrim-hesbon-app.vercel.app/privacy`.
- User Privacy Choices URL: `https://sogrim-hesbon-app.vercel.app/account-deletion`.
- לסמן שהמידע מקושר לזהות, משמש ל-App Functionality ואינו משמש למעקב.
- סוגי המידע המדויקים נמצאים ב-`apple-app-privacy-he.md` ותואמים ל-Privacy Manifest שבאפליקציה.

## 5. גרסה 3.38

- Promotional Text, Description ו-Keywords: להעתיק מ-`app-store-metadata-he.json`.
- Support URL: `https://sogrim-hesbon-app.vercel.app/support`.
- Marketing URL: `https://sogrim-hesbon-app.vercel.app/`.
- Copyright: `2026 Yarin Izhak`.
- להעלות את שלושת צילומי ה-6.9 אינץ' מתוך `docs/store-assets` לפי הסדר 01, 02, 03.
- לבחור את Build 61 לאחר שהוא מסיים Processing ב-TestFlight.

## 6. App Review Information

- Sign-in required: כן.
- להזין את חשבון הבדיקה רק בשדות המאובטחים של App Store Connect.
- להעתיק את מסלול הבדיקה באנגלית מ-`apple-review-notes-en.txt`.
- Contact: שם בעל החשבון, טלפון ואימייל זמינים לבודק.
- Notes: האפליקציה מחשבת התחשבנות בלבד, אינה מחזיקה כסף ואינה מבצעת העברות.

## 7. Availability וגרסה

- Price: Free.
- Availability ראשונית: Israel.
- Version release: Manually release this version, כדי לאפשר בדיקה אחרונה לפני פרסום.
- Export Compliance: No, האפליקציה אינה משתמשת בהצפנה שאינה פטורה וה-Plist כבר כולל `ITSAppUsesNonExemptEncryption=false`.
- Advertising Identifier: לא בגרסת iOS הראשונה.

## 8. בנייה והעלאה

- מסלול הענן מוכן ב-`.github/workflows/ios-testflight.yml`.
- משתנים וסודות נדרשים מפורטים ב-`apple-cloud-build-he.md`.
- כל Build חייב לקבל מספר ייחודי. לאחר Build 61 יש להשתמש ב-62, 63 וכן הלאה.
- לפני שליחה ל-Review יש לבדוק Sign in with Apple, קישור הזמנה, QR, הוספת הוצאה, סיכום ומחיקת חשבון על iPhone אמיתי.
- לאחר שכל הגדרות החשבון הושלמו, להריץ `$env:APPLE_TEAM_ID="XXXXXXXXXX"; npm run qa:ios:review`. אין לשלוח ל-Review עד שכל הבדיקות מחזירות `true`.
