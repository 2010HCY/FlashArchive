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

// 将时间格式（例如 "2024-11-26 00:13:17"）转换为 Sitemap 标准格式（例如 "2025-01-30T11:58:38+00:00"）
std::string convertToSitemapTime(const std::string &timeString) {
    std::tm tm = {};
    std::istringstream iss(timeString);
    // 解析格式：%Y-%m-%d %H:%M:%S
    iss >> std::get_time(&tm, "%Y-%m-%d %H:%M:%S");
    if (iss.fail()) {
        std::cerr << "时间格式解析失败: " << timeString << std::endl;
        return "";
    }
    time_t t = timegm(&tm);
    std::tm* gmt = std::gmtime(&t);
    
    char buf[80];
    // 格式化为 ISO 8601 格式：YYYY-MM-DDTHH:MM:SS+00:00
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S+00:00", gmt);
    return std::string(buf);
}

int main(int argc, char* argv[]) {
    // 设置 locale 以正确处理中文输出（命令行模式下）  
    std::setlocale(LC_ALL, "");

    // 读取 JSON 文件 api/games_name.json
    std::string jsonInputFilename = "api/games_name.json";
    std::ifstream inputFile(jsonInputFilename);
    if (!inputFile.is_open()) {
        std::cerr << "无法打开 JSON 文件: " << jsonInputFilename << std::endl;
        return 1;
    }
    
    json jsonData;
    try {
        inputFile >> jsonData;
    } catch (json::parse_error &e) {
        std::cerr << "JSON 文件解析错误: " << e.what() << std::endl;
        return 1;
    }
    inputFile.close();
    
    // 生成 sitemap.xml
    std::ofstream sitemapFile("sitemap.xml");
    if (!sitemapFile.is_open()) {
        std::cerr << "无法创建 sitemap.xml 文件" << std::endl;
        return 1;
    }
    
    sitemapFile << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    sitemapFile << "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
    
    // 读取 JSON 数据，生成每个 <url> 节点
    for (const auto& item : jsonData) {
        std::string name = item["name"];
        std::string time = item["time"];
        std::string title = name; // 标题为 name
        std::string url = "https://flash.100713.xyz/Games/" + name; // 构建 URL
        std::string sitemapTime = convertToSitemapTime(time); // 格式化时间
        
        sitemapFile << "  <url>\n";
        sitemapFile << "    <loc>" << url << "</loc>\n";
        sitemapFile << "    <lastmod>" << sitemapTime << "</lastmod>\n";
        sitemapFile << "    <title>" << title << "</title>\n"; // 非标准标签，仅作扩展显示标题
        sitemapFile << "  </url>\n";
    }

    sitemapFile << "</urlset>\n";
    sitemapFile.close();
    
    // 提示信息：如果命令行参数中包含 "-c"，则在控制台输出，否则弹出窗口
    if (argc > 1 && std::strcmp(argv[1], "-c") == 0) {
        std::cout << "站点地图生成完毕" << std::endl;
    } else {
#ifdef _WIN32
        // 隐藏控制台窗口
        HWND consoleWnd = GetConsoleWindow();
        if (consoleWnd != NULL) {
            ShowWindow(consoleWnd, SW_HIDE);
        }
        
        // 使用 MessageBoxW 弹出对话框
        MessageBoxW(NULL, L"站点地图生成完毕", L"OK!", MB_OK);
#else
        std::cout << "站点地图生成完毕" << std::endl;
#endif
    }
    
    return 0;
}