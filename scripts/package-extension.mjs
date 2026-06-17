import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const distDir = 'dist'
const outputFile = 'focus-guard.zip'
const encoder = new TextEncoder()

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }

  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function uint16(value) {
  const buffer = Buffer.allocUnsafe(2)

  buffer.writeUInt16LE(value)
  return buffer
}

function uint32(value) {
  const buffer = Buffer.allocUnsafe(4)

  buffer.writeUInt32LE(value)
  return buffer
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)

      if (entry.isDirectory()) {
        return listFiles(path)
      }

      return path
    }),
  )

  return files.flat()
}

function toZipPath(path) {
  return relative(distDir, path).split(sep).join('/')
}

function createLocalFileHeader(nameBuffer, checksum, size) {
  return Buffer.concat([
    uint32(0x04034b50),
    uint16(20),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(checksum),
    uint32(size),
    uint32(size),
    uint16(nameBuffer.length),
    uint16(0),
    nameBuffer,
  ])
}

function createCentralDirectoryHeader(nameBuffer, checksum, size, offset) {
  return Buffer.concat([
    uint32(0x02014b50),
    uint16(20),
    uint16(20),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(checksum),
    uint32(size),
    uint32(size),
    uint16(nameBuffer.length),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(offset),
    nameBuffer,
  ])
}

function createEndOfCentralDirectory(fileCount, centralDirectorySize, centralDirectoryOffset) {
  return Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(fileCount),
    uint16(fileCount),
    uint32(centralDirectorySize),
    uint32(centralDirectoryOffset),
    uint16(0),
  ])
}

async function packageExtension() {
  const distStat = await stat(distDir)

  if (!distStat.isDirectory()) {
    throw new Error('dist 폴더가 없습니다. npm run build를 먼저 실행하세요.')
  }

  const localParts = []
  const centralParts = []
  let offset = 0

  for (const file of await listFiles(distDir)) {
    const content = await readFile(file)
    const nameBuffer = encoder.encode(toZipPath(file))
    const checksum = crc32(content)
    const header = createLocalFileHeader(nameBuffer, checksum, content.length)

    localParts.push(header, content)
    centralParts.push(createCentralDirectoryHeader(nameBuffer, checksum, content.length, offset))
    offset += header.length + content.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = createEndOfCentralDirectory(centralParts.length, centralDirectory.length, offset)

  await writeFile(outputFile, Buffer.concat([...localParts, centralDirectory, end]))
}

await packageExtension()
