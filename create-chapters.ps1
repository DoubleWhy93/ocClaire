# PowerShell script to create chapter files from the source document
$sourceFile = "c:\characters\ocClaire\一千零一夜？.md"
$outputDir = "c:\characters\ocClaire\src\content\fiction\yi-qian-ling-yi"

# Read the entire source file
$content = Get-Content -Path $sourceFile -Raw -Encoding UTF8

# Define chapter titles for each numbered section
$chapterTitles = @(
    "梦中的活春宫",
    "鱼头人的召唤",
    "宅男的Galgame梦",
    "马尔库斯的噩梦",
    "魅魔入侵",
    "墓园的女鬼",
    "魔药试验",
    "女仆咖啡厅",
    "宁静的花园",
    "远古的黑鸟",
    "珍妮特的告别",
    "金鱼汤之梦",
    "深海潜艇",
    "香料与梦境",
    "豌豆公主的棺材床",
    "阿德里安诺的美梦",
    "拉斐尔的背影",
    "月球漫步",
    "豌豆公主",
    "朋克血族",
    "睡美人的吻",
    "火刑架上的焦尸",
    "日本的祭典",
    "圣诞节的马术",
    "荒野的吉普车",
    "父母的梦",
    "母亲的子宫",
    "混乱的会议",
    "维托里乌斯的饥饿",
    "莫奈的夕阳",
    "美梦与噩梦",
    "会议的卖惨",
    "公务处理",
    "游乐园般的世界",
    "淫乱派对",
    "罗马的邂逅",
    "DPA的监视",
    "莉莉丝的礼物",
    "布莱恩公爵",
    "尝试激怒阿德里安诺",
    "性别互换"
)

# Split content by numbered sections (1、2、3、etc.)
$sections = $content -split '(?=\d+、)'

$chapterNum = 1
foreach ($section in $sections) {
    if ($section -match '^\d+、') {
        # Remove the number prefix
        $chapterContent = $section -replace '^\d+、\s*', ''
        $chapterContent = $chapterContent.Trim()
        
        if ($chapterContent.Length -gt 0) {
            $paddedNum = $chapterNum.ToString("D2")
            $title = $chapterTitles[$chapterNum - 1]
            
            $frontmatter = @"
---
type: chapter
novel: yi-qian-ling-yi
chapterNumber: $chapterNum
chapterTitle: $title
order: $chapterNum
---

$chapterContent
"@
            
            $outputFile = Join-Path $outputDir "chapter-$paddedNum.md"
            $frontmatter | Out-File -FilePath $outputFile -Encoding UTF8
            Write-Host "Created chapter $chapterNum"
            $chapterNum++
        }
    }
}

Write-Host "Created $($chapterNum - 1) chapters"
