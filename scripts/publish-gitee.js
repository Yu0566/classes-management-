const https = require('https')
const fs = require('fs')
const path = require('path')

const { execSync } = require('child_process')
const TOKEN = process.env.GITEE_TOKEN
if (!TOKEN) {
  console.error('错误: 请设置 GITEE_TOKEN 环境变量')
  console.error('获取方式: Gitee → 设置 → 私人令牌 → 生成新令牌')
  process.exit(1)
}

const OWNER = 'yu0566'
const REPO = 'class-management'
const API_HOST = 'gitee.com'
const RELEASE_DIR = path.join(__dirname, '..', 'release')

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))
const VERSION = pkg.version
const TAG = `V${VERSION}`
const EXE_NAME = `课堂管理系统 Setup ${VERSION}.exe`

function apiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: API_HOST,
      path: `/api/v5${apiPath}?access_token=${TOKEN}`,
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    const req = https.request(opts, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

function uploadFile(releaseId, filePath, fileName) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2)
    const fileContent = fs.readFileSync(filePath)

    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    )
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)

    const body = Buffer.concat([header, fileContent, footer])

    const req = https.request(
      {
        hostname: API_HOST,
        path: `/api/v5/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files?access_token=${TOKEN}`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, data })
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  // 1. 检查文件是否存在
  const exePath = path.join(RELEASE_DIR, EXE_NAME)
  const ymlPath = path.join(RELEASE_DIR, 'latest.yml')
  if (!fs.existsSync(exePath)) {
    console.error(`错误: 找不到 ${exePath}`)
    process.exit(1)
  }
  if (!fs.existsSync(ymlPath)) {
    console.error(`错误: 找不到 ${ymlPath}`)
    process.exit(1)
  }

  // 修复 latest.yml 中的文件名（electron-builder 用英文 name，需改为中文 productName）
  let ymlContent = fs.readFileSync(ymlPath, 'utf-8')
  const engName = `class-management-setup-${VERSION}.exe`
  if (ymlContent.includes(engName)) {
    ymlContent = ymlContent.replaceAll(engName, EXE_NAME)
    fs.writeFileSync(ymlPath, ymlContent, 'utf-8')
    console.log('已修正 latest.yml 中的文件名')
  }

  console.log(`发布 ${TAG} 到 Gitee...`)

  // 2. 检查是否已存在同名 Release，存在则删除
  const listRes = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases`)
  const existing = (Array.isArray(listRes.data) ? listRes.data : []).find((r) => r.tag_name === TAG)
  if (existing) {
    console.log(`删除已有 Release: ${TAG} (id=${existing.id})`)
    const delRes = await apiRequest('DELETE', `/repos/${OWNER}/${REPO}/releases/${existing.id}`)
    if (delRes.status === 204 || delRes.status === 200) {
      console.log('已删除')
    } else {
      console.error('删除失败:', JSON.stringify(delRes.data).slice(0, 200))
      process.exit(1)
    }
  }

  // 3. 创建新 Release
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
  console.log(`创建 Release: ${TAG} (分支: ${branch})`)
  const createRes = await apiRequest('POST', `/repos/${OWNER}/${REPO}/releases`, {
    tag_name: TAG,
    name: `${VERSION}版本`,
    body: `${VERSION}版本`,
    target_commitish: branch,
    prerelease: false,
  })
  if (createRes.status !== 201) {
    console.error('创建 Release 失败:', JSON.stringify(createRes.data).slice(0, 200))
    process.exit(1)
  }
  const releaseId = createRes.data.id
  console.log(`Release 创建成功 (id=${releaseId})`)

  // 4. 上传 exe
  const exeSize = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1)
  process.stdout.write(`上传 ${EXE_NAME} (${exeSize} MB)... `)
  const exeRes = await uploadFile(releaseId, exePath, EXE_NAME)
  console.log(exeRes.status === 201 ? '成功' : '失败: ' + JSON.stringify(exeRes.data).slice(0, 200))

  // 5. 上传 latest.yml
  process.stdout.write('上传 latest.yml... ')
  const ymlRes = await uploadFile(releaseId, ymlPath, 'latest.yml')
  console.log(ymlRes.status === 201 ? '成功' : '失败: ' + JSON.stringify(ymlRes.data).slice(0, 200))

  console.log(`\n发布完成: https://gitee.com/${OWNER}/${REPO}/releases/${TAG}`)
}

main().catch((err) => {
  console.error('发布失败:', err.message)
  process.exit(1)
})
