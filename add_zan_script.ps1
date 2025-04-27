Write-Host "脚本开始执行..."

Get-ChildItem -Path ".\Games" -Directory | ForEach-Object {
    $folderName = $_.Name
    Write-Host "正在处理文件夹: $folderName"
    $filePath = Join-Path $_.FullName "index.html"
    Write-Host "构建的文件路径: $filePath"
    if (Test-Path -Path $filePath) {
        Write-Host "文件存在: $filePath"
        try {
            $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
            $ruffleScriptIndex = $content.LastIndexOf('<script src="/api/ruffle/ruffle.js"></script>')
            $headEndIndex = $content.LastIndexOf("</head>")

            if ($ruffleScriptIndex -ge 0 -and $headEndIndex -ge 0 -and $ruffleScriptIndex -lt $headEndIndex) {
                $insertPoint = $headEndIndex
                $scriptTag = "`n    <script type=`"text/javascript`" src=`"/api/index/index-count.js`"></script>"
                $newContent = $content.Insert($insertPoint, $scriptTag)
                [System.IO.File]::WriteAllText($filePath, $newContent, [System.Text.Encoding]::UTF8)
                Write-Host "成功写入文件: $filePath"
            } else {
                Write-Host "Could not find <script src=\"/api/ruffle/ruffle.js\"></script> or </head> tag in the correct order in: $filePath"
            }
        } catch {
            Write-Error "读取或写入文件时发生错误: $_"
        }
    } else {
        Write-Host "文件不存在: $filePath"
    }
}

Write-Host "脚本执行完毕。"