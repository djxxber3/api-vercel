# نظام تبديل الروابط التلقائي - دليل المطور

## المشكلة
كان المشغل يشغل الـ segment الأول فقط ثم يتوقف، ولا يتابع تشغيل المقاطع التالية أو ينتقل للروابط الاحتياطية عند فشل أحد الروابط.

## الحل
تم تطوير نظام تبديل الروابط التلقائي (URL Failover System) الذي يوفر:

1. **ترتيب الروابط حسب الأولوية**
2. **مراقبة حالة الروابط**  
3. **تبديل تلقائي للروابط الاحتياطية**
4. **إبلاغ الأخطاء والفشل**

## API الجديدة

### 1. الحصول على روابط مرتبة حسب الأولوية
```
GET /api/channels/:id/urls
```

**الاستجابة:**
```json
{
  "channelId": "123",
  "channelName": "قناة تجريبية",
  "urls": [
    {
      "url": "https://example.com/stream1.m3u8",
      "quality": "HD",
      "priority": 0,
      "isHealthy": true,
      "lastChecked": "2024-01-01T12:00:00Z"
    },
    {
      "url": "https://backup.com/stream2.m3u8", 
      "quality": "HD",
      "priority": 1,
      "isHealthy": true,
      "lastChecked": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### 2. فحص حالة الروابط
```
POST /api/channels/:id/check-health
```

**الاستجابة:**
```json
{
  "message": "Health check completed",
  "healthySummary": {
    "total": 3,
    "healthy": 2,
    "unhealthy": 1
  }
}
```

### 3. إبلاغ فشل رابط
```
POST /api/channels/:id/report-failure
Content-Type: application/json

{
  "urlIndex": 0,
  "error": "Connection timeout"
}
```

**الاستجابة:**
```json
{
  "message": "Failure reported and URL marked as unhealthy",
  "nextUrl": {
    "url": "https://backup.com/stream2.m3u8",
    "quality": "HD",
    "priority": 1
  },
  "remainingHealthyUrls": 2
}
```

## كيفية الاستخدام في المشغل

### 1. بدء التشغيل
```javascript
async function startPlayback(channelId) {
    // الحصول على الروابط مرتبة حسب الأولوية
    const response = await fetch(`/api/channels/${channelId}/urls`);
    const data = await response.json();
    
    this.urls = data.urls;
    this.currentIndex = 0;
    
    await this.playUrl(this.urls[this.currentIndex]);
}
```

### 2. التعامل مع فشل الرابط
```javascript
async function handlePlaybackError(error) {
    // إبلاغ السيرفر عن الفشل
    await fetch(`/api/channels/${this.channelId}/report-failure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            urlIndex: this.currentIndex,
            error: error.message
        })
    });
    
    // الانتقال للرابط التالي
    this.currentIndex++;
    if (this.currentIndex < this.urls.length) {
        await this.playUrl(this.urls[this.currentIndex]);
    } else {
        console.error('جميع الروابط فشلت');
    }
}
```

### 3. التحقق الدوري من صحة الروابط
```javascript
async function checkUrlsHealth(channelId) {
    await fetch(`/api/channels/${channelId}/check-health`, {
        method: 'POST'
    });
}
```

## التحسينات المضافة للواجهة

### 1. إدارة الأولوية
- أزرار لتحريك الروابط لأعلى/أسفل
- حقل رقمي لتحديد الأولوية  
- ترتيب تلقائي حسب الأولوية

### 2. مراقبة الحالة
- عرض حالة كل رابط (يعمل/معطل)
- تاريخ آخر فحص
- إحصائيات سريعة في قائمة القنوات

### 3. أزرار الفحص
- زر "فحص الروابط" لكل قناة
- عرض النتائج في الوقت الفعلي

## مثال كامل للتطبيق

راجع ملف `player-demo.html` للحصول على مثال عملي كامل يوضح:
- تحميل القنوات
- محاكاة تشغيل الروابط  
- التبديل التلقائي عند الفشل
- إبلاغ الأخطاء للسيرفر

## الملاحظات المهمة

1. **الأولوية**: الأرقام الأصغر تعني أولوية أعلى (0 = أعلى أولوية)
2. **الحالة الافتراضية**: جميع الروابط تعتبر صحية افتراضياً
3. **التحقق الدوري**: يُنصح بفحص الروابط كل ساعة
4. **التعامل مع الأخطاء**: يجب على المشغل إبلاغ الفشل فوراً

## التوافق العكسي

النظام الجديد متوافق تماماً مع القنوات الموجودة. الروابط القديمة ستحصل على:
- أولوية افتراضية حسب ترتيبها
- حالة صحية افتراضية (true)