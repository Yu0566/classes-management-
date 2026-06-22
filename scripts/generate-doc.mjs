import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx'
import fs from 'fs'
import path from 'path'

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: '微软雅黑', size: 24 },
      },
    },
  },
  sections: [{
    properties: {
      page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
    },
    children: [
      // 标题
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({ text: '课堂管理系统', bold: true, size: 48, font: '微软雅黑' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({ text: '功能介绍', size: 36, font: '微软雅黑', color: '444444' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [
          new TextRun({ text: '版本 v3.2.0 | 2026年6月', size: 22, font: '微软雅黑', color: '888888' }),
        ],
      }),

      // ============ 产品概述 ============
      heading('一、产品概述'),
      body('课堂管理系统是一款专为中小学班级管理设计的桌面端一体化应用。系统覆盖班级日常管理的各个环节——从积分激励、考勤值日到作业跟踪、师生互动，为教师提供高效的数字化管理工具。'),
      body('系统采用本地部署方案，数据存储在教室电脑本地，无需依赖外部云服务，保障数据安全。同时支持局域网和公网两种远程访问方式，教师可通过浏览器在任何地点进行管理操作，学生可通过手机完成签到互动。'),
      blank(),

      // ============ 积分激励体系 ============
      heading('二、积分激励体系'),
      blank(),

      subHeading('2.1 小组积分'),
      body('以小组为单位进行课堂积分管理。教师可在课堂上实时为各小组加分或扣分，积分变化即时反映在教室大屏看板上，形成可视化的组间竞争氛围。支持自定义加/扣分原因记录，便于追溯。'),
      blank(),

      subHeading('2.2 个人积分'),
      body('为每位学生建立独立的积分档案。系统完整记录每一笔积分变动的时间、分值、原因和操作来源，形成清晰的积分流水。支持手动调整积分、按排名展示，并引入"累计学习积分"用于排名决胜，避免并列。'),
      blank(),

      subHeading('2.3 小组植树（游戏化激励）'),
      body('每个小组拥有一棵专属虚拟植物，共有樱花、向日葵、竹子、梅花、薰衣草、银杏、橘子树、玫瑰8个品种可选。小组通过积累积分，可以对植物执行浇水、施肥、晒太阳、除虫等养护操作。'),
      body('植物从种子开始，经历幼苗、小树、大树、开花五个成长阶段，每个阶段都有独特的视觉形态变化。通过游戏化机制将积分竞争转化为可见的成长过程，增强学生的团队荣誉感和持续参与动力。'),
      blank(),

      subHeading('2.4 宝龙币'),
      body('小组虚拟货币系统，作为积分体系的补充激励手段。支持发放、消费和余额查询，可用于兑换班级特权或奖励。'),
      blank(),

      // ============ 日常管理 ============
      heading('三、日常管理'),
      blank(),

      subHeading('3.1 班级看板'),
      body('系统的核心展示界面，专为教室投屏设计。看板集中展示当日关键信息：值日班委、考勤统计、小组排名、作业完成情况、扣分记录、宝龙币余额等多个数据模块。'),
      body('教师可通过拖拽自由调整模块排列顺序，布局位置自动保存。另外配有独立的"桌面便签"小窗口，始终置顶显示关键数据，不影响其他软件使用。'),
      blank(),

      subHeading('3.2 每日考勤'),
      body('按时间窗口进行考勤管理，支持记录出勤、迟到、缺勤、请假等多种状态。考勤数据自动汇总到班级看板，方便教师一眼掌握当日到校情况。'),
      blank(),

      subHeading('3.3 值日管理'),
      body('管理每日值日学生分工安排。支持标记完成状态（已完成/未完成/免除），支持标注学生来历（如"借调"），便于跨组协调。敏感操作（如重置状态）受密码保护，防止学生误操作。'),
      blank(),

      subHeading('3.4 班级轮值'),
      body('按周自动轮换的班级岗位排班系统。支持自定义岗位名称，系统自动生成轮值日历，教师只需初始配置即可长期运行，无需每周手动排班。'),
      blank(),

      subHeading('3.5 午餐午休'),
      body('午餐和午休时段的纪律管理模块，记录表现良好和违纪学生，配合积分体系形成正向引导。'),
      blank(),

      // ============ 作业管理 ============
      heading('四、作业管理'),
      blank(),

      subHeading('4.1 作业提交记录'),
      body('按日期记录各科作业的学生提交情况，支持标记已交、未交、免交等状态。未交作业名单自动同步到班级看板展示。'),
      blank(),

      subHeading('4.2 数学作业等级'),
      body('针对数学学科的专项评级系统，按 A/B/C/D 四个等级评价作业质量，系统自动统计各等级分布，帮助教师掌握学生学习情况趋势。'),
      blank(),

      subHeading('4.3 每日一练'),
      body('学生日常练习的签到追踪模块，按名册管理每日练习完成情况，养成持续学习习惯。'),
      blank(),

      // ============ 师生互动 ============
      heading('五、师生互动'),
      blank(),

      subHeading('5.1 班级通知'),
      body('教师发送通知后，教室大屏即时弹出通知窗口。支持全屏覆盖和顶部横幅两种展示模式，可设置通知紧急度（普通/重要/紧急），支持附带图片。'),
      body('特色功能——确认模式：教师可指定特定学生必须点击"确认已读"，系统实时追踪确认状态，确保重要信息传达到位。通知历史完整保存，便于回溯。'),
      blank(),

      subHeading('5.2 留言板'),
      body('学生向教师表达想法，由教师在浏览器端录入（学生姓名+留言内容），发送至教室系统展示。教室端以"便利贴墙"效果呈现，视觉效果逼真精致，适合教室大屏展示。'),
      body('支持按标签分类（建议/感谢/心愿/其他），支持多图上传和粘贴图片，支持自定义字体颜色和大小，支持设置过期时间自动清理。教室端仅展示不可编辑，防止学生随意修改。'),
      blank(),

      subHeading('5.3 成长记录'),
      body('长期记录学生的成长轨迹，为每位学生建立纵向发展档案。支持按任意时间段查询（最长三年），帮助教师回顾学生发展历程。清空操作受密码保护，防止数据误删。'),
      blank(),

      // ============ 课后管理 ============
      heading('六、课后管理'),
      blank(),

      subHeading('6.1 小组团建'),
      body('以小组为单位发起课后团建活动。教师设定活动时长后启动倒计时，学生通过手机浏览器扫码签到。支持多个小组同时进行不同活动，各组状态完全独立。活动结束后自动统计签到情况。'),
      blank(),

      subHeading('6.2 罚抄管理'),
      body('记录需要罚抄的学生名单，学生完成后通过浏览器端签到确认"已抄完"，实现无纸化流程管理。教师可一键发送催促通知提醒未完成学生，通知自动附加"来办公室"提示。'),
      blank(),

      subHeading('6.3 延时续费'),
      body('管理放学后延时服务的学生签到签退。追踪每位学生的到达和离开状态，密码保护的重置功能确保数据安全。'),
      blank(),

      // ============ 系统特色 ============
      heading('七、系统特色'),
      blank(),

      subHeading('7.1 教室大屏适配'),
      body('班级看板、通知弹窗、留言板便利贴墙等核心功能均针对教室投屏场景优化，字体大、色彩鲜明、信息层次清晰，确保教室后排学生也能清晰看到。'),
      blank(),

      subHeading('7.2 多端远程访问'),
      bullet('局域网模式：同一校园网络下，教师和学生通过浏览器访问系统，支持手机、平板等移动设备'),
      bullet('公网模式：通过 Cloudflare 隧道技术映射至固定域名，教师可从家中或办公室远程管理教室系统，无需 VPN 等复杂配置'),
      blank(),

      subHeading('7.3 学生端互动'),
      body('学生通过手机/平板浏览器即可完成签到、确认通知、罚抄完成等操作，无需安装任何应用，降低使用门槛。'),
      blank(),

      subHeading('7.4 数据安全与自主'),
      bullet('本地存储：所有数据存储在教室电脑本地数据库，不上传任何第三方服务器'),
      bullet('密码保护：敏感操作统一密码保护，防止学生误操作或恶意修改'),
      bullet('数据备份：支持数据导出（学生信息与历史记录分开），支持数据导入恢复'),
      bullet('旧版兼容：版本升级时自动检测旧数据并提供迁移选项，确保数据不丢失'),
      blank(),

      subHeading('7.5 自动更新'),
      body('系统基于远程发布平台实现 OTA（空中下载）自动更新。当有新版本发布时，教室电脑自动检测并提示安装，无需人工干预，维护成本接近零。'),
      blank(),

      // ============ 应用价值 ============
      heading('八、应用价值'),
      blank(),

      createFeatureTable([
        ['提升课堂参与度', '积分竞争 + 植树游戏化 + 看板投屏，让学生在可见的反馈中保持学习动力'],
        ['减少管理负担', '考勤、值日、轮值、作业一键管理，告别纸质记录和人工统计'],
        ['信息传达有保障', '通知确认已读 + 留言板互动，确保重要信息不遗漏'],
        ['支持远程办公', '公网固定域名访问，教师不在教室也能实时管理班级事务'],
        ['数据安全可控', '本地存储 + 自动备份 + 密码保护，数据完全掌握在学校手中'],
      ]),
    ],
  }],
})

function heading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, font: '微软雅黑' })],
  })
}

function subHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 26, font: '微软雅黑' })],
  })
}

function body(text) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    indent: { firstLine: 480 },
    children: [new TextRun({ text, size: 24, font: '微软雅黑' })],
  })
}

function bullet(text) {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: 480 },
    children: [new TextRun({ text: '•  ' + text, size: 24, font: '微软雅黑' })],
  })
}

function blank() {
  return new Paragraph({ spacing: { after: 120 }, children: [] })
}

function createFeatureTable(rows) {
  const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
  const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            borders,
            shading: { fill: '4A7C59' },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '价值维度', bold: true, size: 24, font: '微软雅黑', color: 'FFFFFF' })] })],
          }),
          new TableCell({
            width: { size: 72, type: WidthType.PERCENTAGE },
            borders,
            shading: { fill: '4A7C59' },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '具体效果', bold: true, size: 24, font: '微软雅黑', color: 'FFFFFF' })] })],
          }),
        ],
      }),
      ...rows.map(([feat, desc], i) => new TableRow({
        children: [
          new TableCell({
            borders,
            shading: i % 2 === 0 ? { fill: 'F5F9F6' } : undefined,
            children: [new Paragraph({ children: [new TextRun({ text: feat, bold: true, size: 22, font: '微软雅黑' })] })],
          }),
          new TableCell({
            borders,
            shading: i % 2 === 0 ? { fill: 'F5F9F6' } : undefined,
            children: [new Paragraph({ children: [new TextRun({ text: desc, size: 22, font: '微软雅黑' })] })],
          }),
        ],
      })),
    ],
  })
}

const outPath = path.join(process.cwd(), 'docs', '课堂管理系统-功能介绍.docx')
const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(outPath, buffer)
console.log('已生成:', outPath)
