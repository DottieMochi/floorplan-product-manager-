// js/demoData.js
// 首次打开（本地无数据）时载入的演示数据，纯示例，可随意修改或删除。
// 访客一旦编辑/导入，就会保存为其自己的数据，演示数据不再出现。
export const DEMO_AREAS = [
  {
    name: '入口展示区', x: 80, y: 80, w: 200, h: 120,
    color: '#3498db', textColor: '#ffffff', fontSize: 16, shape: 'rect',
    products: [
      { name: '迎宾海报', barcode: '1000001', specification: 'A1', unit: '张', stock: 5 },
      { name: '导购指南', barcode: '1000002', specification: '通用', unit: '本', stock: 20 }
    ]
  },
  {
    name: '饮料区', x: 80, y: 250, w: 210, h: 150,
    color: '#16a085', textColor: '#ffffff', fontSize: 16, shape: 'rect',
    products: [
      { name: '矿泉水', barcode: '2000001', specification: '550ml', unit: '瓶', stock: 120 },
      { name: '可乐', barcode: '2000002', specification: '330ml', unit: '罐', stock: 80 },
      { name: '鲜橙汁', barcode: '2000003', specification: '1L', unit: '盒', stock: 35 }
    ]
  },
  {
    name: '生鲜区', x: 340, y: 80, w: 230, h: 160,
    color: '#2ecc71', textColor: '#ffffff', fontSize: 16, shape: 'roundRect',
    products: [
      { name: '红富士苹果', barcode: '3000001', specification: '约250g', unit: '个', stock: 60 },
      { name: '香蕉', barcode: '3000002', specification: '散装', unit: 'kg', stock: 40 },
      { name: '番茄', barcode: '3000003', specification: '散装', unit: 'kg', stock: 25 }
    ]
  },
  {
    name: '促销岛', x: 620, y: 110, w: 180, h: 180,
    color: '#e67e22', textColor: '#ffffff', fontSize: 16, shape: 'circle',
    products: [
      { name: '混合坚果礼盒', barcode: '4000001', specification: '500g', unit: '盒', stock: 18 },
      { name: '节日饼干', barcode: '4000002', specification: '300g', unit: '袋', stock: 30 }
    ]
  },
  {
    name: '收银台', x: 360, y: 300, w: 180, h: 120,
    color: '#9b59b6', textColor: '#ffffff', fontSize: 16, shape: 'diamond',
    products: [
      { name: '口香糖', barcode: '5000001', specification: '盒装', unit: '盒', stock: 50 }
    ]
  }
];
