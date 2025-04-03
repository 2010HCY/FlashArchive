#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <set>
#include <vector>
#include <ctime>
#include <json.hpp>
#include <iomanip>  // 用于 std::get_time

using json = nlohmann::json;

// 返回当前时间，使用 RFC-822 格式
std::string getCurrentTime() {
    std::time_t now = std::time(nullptr);
    char buf[80];
    std::strftime(buf, sizeof(buf), "%a, %d %b %Y %H:%M:%S GMT", std::gmtime(&now));
    return std::string(buf);
}

// 简单提取字符串中两个定界符之间的内容
std::string extractBetween(const std::string& str, const std::string& start_delim, const std::string& end_delim) {
    size_t start = str.find(start_delim);
    if (start == std::string::npos) return "";
    start += start_delim.size();
    size_t end = str.find(end_delim, start);
    if (end == std::string::npos) return "";
    return str.substr(start, end - start);
}

// 将 "YYYY-MM-DD HH:MM:SS" 转换为 RFC-822 格式
std::string formatRssDate(const std::string& datetime) {
    std::tm tm = {};
    std::istringstream ss(datetime);
    ss >> std::get_time(&tm, "%Y-%m-%d %H:%M:%S");
    
    if (ss.fail()) {
        std::cerr << "时间格式不正确: " << datetime << std::endl;
        return getCurrentTime();  // 如果解析失败，返回当前时间
    }

    tm.tm_isdst = -1; // 自动判断夏令时
    std::time_t time = std::mktime(&tm);
    char buf[80];
    std::strftime(buf, sizeof(buf), "%a, %d %b %Y %H:%M:%S GMT", std::gmtime(&time));
    return std::string(buf);
}

// 读取现有 RSS XML 中的链接与发布时间映射（简单解析）
json readXmlPubDates(const std::string& xmlFilename) {
    json xmlMap = json::object();
    std::ifstream xmlFile(xmlFilename);
    if (!xmlFile.is_open())
        return xmlMap; // 文件不存在则返回空对象

    std::string line;
    std::string currentLink;
    while (std::getline(xmlFile, line)) {
        if (line.find("<link>") != std::string::npos) {
            currentLink = extractBetween(line, "<link>", "</link>");
        } else if (line.find("<pubDate>") != std::string::npos) {
            std::string pubDate = extractBetween(line, "<pubDate>", "</pubDate>");
            if (!currentLink.empty()) {
                xmlMap[currentLink] = pubDate;
                currentLink.clear();
            }
        }
    }
    xmlFile.close();
    return xmlMap;
}

#ifdef _WIN32
#include <windows.h>
// Windows 下使用 _mkgmtime 替代 timegm
#define timegm _mkgmtime
#endif

int main(int argc, char* argv[]) {
    std::string jsonInputFilename = "api/games_name.json";
    std::string xmlOutputFilename = "rss.xml";

    // --- 1. 读取 JSON 数据 ---
    std::ifstream inputFile(jsonInputFilename);
    if (!inputFile.is_open()){
        MessageBoxW(NULL, L"无法打开文件!", L"错误", MB_OK | MB_ICONERROR);
        return 1;
    }
    
    json jsonData;
    try {
        inputFile >> jsonData;
    } catch (json::parse_error& e) {
        MessageBoxW(NULL, L"JSON 文件格式不正确!", L"错误", MB_OK | MB_ICONERROR);
        return 1;
    }
    inputFile.close();

    // --- 2. 生成 RSS XML 内容 ---
    std::ostringstream xmlContent;
    xmlContent << "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n";
    xmlContent << "<rss version=\"2.0\">\n";
    xmlContent << "  <channel>\n";
    xmlContent << "    <title>Flash收藏站</title>\n";
    xmlContent << "    <link>https://flash.100713.xyz/</link>\n";
    xmlContent << "    <description>最新Flash游戏列表 RSS 订阅</description>\n";
    xmlContent << "    <language>zh-CN</language>\n";
    xmlContent << "    <lastBuildDate>" << getCurrentTime() << "</lastBuildDate>\n";

    // 遍历 JSON 数据，每项代表一个链接
    for (const auto& item : jsonData) {
        std::string name = item["name"];
        std::string desc = item["desc"];
        std::string link = "https://flash.100713.xyz/Games/" + name;  // 更改链接格式

        // 使用 JSON 中的 time 字段转换为 RSS 格式的发布时间
        std::string pubDate = item.contains("time") ? formatRssDate(item["time"]) : getCurrentTime();

        // 写入当前项到 RSS XML
        xmlContent << "    <item>\n";
        xmlContent << "      <title>" << name << "</title>\n";
        xmlContent << "      <link>" << link << "</link>\n";
        xmlContent << "      <description>" << desc << "</description>\n";
        xmlContent << "      <pubDate>" << pubDate << "</pubDate>\n";
        xmlContent << "    </item>\n";
    }

    xmlContent << "  </channel>\n";
    xmlContent << "</rss>\n";

    std::ofstream outputFile(xmlOutputFilename);
    if (!outputFile.is_open()){
        MessageBoxW(NULL, L"无法创建文件!", L"错误", MB_OK | MB_ICONERROR);
        return 1;
    }
    outputFile << xmlContent.str();
    outputFile.close();

    // 提示信息
    if (argc > 1 && std::strcmp(argv[1], "-c") == 0) {
        std::cout << "RSS 订阅链接文件生成完毕" << xmlOutputFilename << std::endl;
    } else {
#ifdef _WIN32
        HWND consoleWnd = GetConsoleWindow();
        if (consoleWnd != NULL) {
            ShowWindow(consoleWnd, SW_HIDE);
        }
        // 使用 MessageBoxW，仅带 OK 按钮，无警告图标（MB_OK）
        MessageBoxW(NULL, L"RSS 订阅链接文件生成完毕", L"完成", MB_OK);
#else
        std::cout << "RSS 订阅链接文件生成完毕" << xmlOutputFilename << std::endl;
#endif
    }

    return 0;
}