#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include "json.hpp"
#include <ctime>
#include <iomanip>
#include <cstring> // 用于 strcmp

#ifdef _WIN32
    #include <windows.h>
    // Windows 下使用 _mkgmtime 替代 timegm
    #define timegm _mkgmtime
#endif

using json = nlohmann::json;

// 将 RSS（日志）时间格式（例如 "Thu, 30 Jan 2025 11:58:38 GMT"）转换为 Sitemap 标准格式（例如 "2025-01-30T11:58:38+00:00"）
std::string convertToSitemapTime(const std::string &rssTime) {
    std::tm tm = {};
    std::istringstream iss(rssTime);
    // 解析格式：%a, %d %b %Y %H:%M:%S GMT
    iss >> std::get_time(&tm, "%a, %d %b %Y %H:%M:%S GMT");
    if (iss.fail()) {
        std::cerr << "时间格式解析失败: " << rssTime << std::endl;
        return "";
    }
    time_t t = timegm(&tm);
    std::tm* gmt = std::gmtime(&t);
    
    char buf[80];
    // 格式化为 ISO 8601 格式：YYYY-MM-DDTHH:MM:SS+00:00
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S+00:00", gmt);
    return std::string(buf);
}

// 从 URL 中提取最后一段（即 "https://flash.100713.xyz/xxx" 中的 xxx 作为标题）
std::string extractTitleFromUrl(const std::string &url) {
    size_t pos = url.find_last_of('/');
    if (pos == std::string::npos || pos + 1 >= url.size())
        return url;
    return url.substr(pos + 1);
}

int main(int argc, char* argv[]) {
    // 设置 locale 以正确处理中文输出（命令行模式下）  
    std::setlocale(LC_ALL, "");
    
    // 读取日志文件 rss_log.json
    std::string logFilename = "rss_log.json";
    std::ifstream logFile(logFilename);
    if (!logFile.is_open()) {
        std::cerr << "无法打开日志文件: " << logFilename << std::endl;
        return 1;
    }
    
    json logData;
    try {
        logFile >> logData;
    } catch (json::parse_error &e) {
        std::cerr << "日志文件解析错误: " << e.what() << std::endl;
        return 1;
    }
    logFile.close();
    
    // 生成 sitemap.xml
    std::ofstream sitemapFile("sitemap.xml");
    if (!sitemapFile.is_open()) {
        std::cerr << "无法创建 sitemap.xml 文件" << std::endl;
        return 1;
    }
    
    sitemapFile << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    sitemapFile << "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
    
    // 遍历日志 JSON 数据，生成每个 <url> 节点
    for (auto it = logData.begin(); it != logData.end(); ++it) {
        std::string url = it.key();       // 完整链接
        std::string rssTime = it.value();   // RSS 格式时间，例如 "Thu, 30 Jan 2025 11:58:38 GMT"
        std::string sitemapTime = convertToSitemapTime(rssTime);
        std::string title = extractTitleFromUrl(url); // 提取 URL 中最后一段作为标题
        
        sitemapFile << "  <url>\n";
        sitemapFile << "    <loc>" << url << "</loc>\n";
        sitemapFile << "    <lastmod>" << sitemapTime << "</lastmod>\n";
        // 非标准标签，仅作扩展显示标题
        sitemapFile << "    <title>" << title << "</title>\n";
        sitemapFile << "  </url>\n";
    }
    sitemapFile << "</urlset>\n";
    sitemapFile.close();
    
    // 提示信息：如果命令行参数中包含 "-c"，则在控制台输出，否则弹出窗口
    if (argc > 1 && std::strcmp(argv[1], "-c") == 0) {
        std::cout << "RSS 订阅链接文件生成完毕" << std::endl;
    } else {
#ifdef _WIN32
        // 隐藏控制台窗口
        HWND consoleWnd = GetConsoleWindow();
        if (consoleWnd != NULL) {
            ShowWindow(consoleWnd, SW_HIDE);
        }
        
        // 使用 MessageBoxW 弹出对话框
        MessageBoxW(NULL, L"RSS 订阅链接文件生成完毕", L"OK!", MB_OK);
#else
        std::cout << "RSS 订阅链接文件生成完毕" << std::endl;
#endif
    }
    
    return 0;
}
