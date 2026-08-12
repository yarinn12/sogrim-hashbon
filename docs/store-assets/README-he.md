# חומרי העלאה לחנויות

## יצירה מחדש

מריצים `npm run store:assets` משורש הפרויקט. הסקריפט פותח את האפליקציה המקומית, מצלם את מסכי המוצר ברזולוציית Retina, בונה את התמונות הממותגות ומוודא פורמט ומידות.

## Google Play

- אייקון: `google-play-icon-512.png` בגודל 512x512 וללא שקיפות.
- Feature Graphic: `google-play-feature-graphic-1024x500.png` בגודל 1024x500 וללא שקיפות.
- צילומי מסך: `google-screenshot-01-event.png`, `google-screenshot-02-expense.png`, `google-screenshot-03-invite.png` בגודל 1080x1920.

## Apple App Store

- אייקון מקור: `app-icon-1024.png` בגודל 1024x1024 וללא שקיפות. האייקון כלול גם בפרויקט Xcode.
- צילומי 6.9 אינץ': `apple-screenshot-01-event-1320x2868.png`, `apple-screenshot-02-expense-1320x2868.png`, `apple-screenshot-03-invite-1320x2868.png`.

## מקורות לעריכה

- `feature-graphic-source.html` יוצר את ה-Feature Graphic.
- `store-screenshot-source.html` ו-`store-screenshot-source.mjs` יוצרים את צילומי המסך הממותגים.
- `generate-store-screenshots.mjs` מפיק צילומי מוצר עדכניים ומרכיב את כל נכסי המסך באופן עקבי.

אין להעלות את `.store-review-credentials.json`. את הפרטים שבתוכו מזינים רק בשדות המאובטחים של App Store Connect ו-Google Play Console.
