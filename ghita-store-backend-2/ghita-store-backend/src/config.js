// إعدادات الأعمال المشتركة (مكان واحد بدل ما تتكرر الأرقام في كذا ملف)

// التوصيل مجاني لو الإجمالي >= الحد ده، وإلا بتتحسب رسوم ثابتة
const FREE_DELIVERY_THRESHOLD = 1000;
const DELIVERY_FEE = 35;

// نطاق التوصيل — لازم يطابق قائمة VILLAGES في store.html
const VILLAGES = [
  "أشمون", "سمادون", "الانجب", "رملة الانجب", "شما",
  "كمشوش", "كفر السنابسة", "منوف", "ميجريا", "لبيشة",
  "كفر الغريب", "هيت",
];

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

module.exports = { FREE_DELIVERY_THRESHOLD, DELIVERY_FEE, VILLAGES, ORDER_STATUSES };
