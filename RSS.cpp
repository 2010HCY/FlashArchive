#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <set>
#include <vector>
#include <ctime>
#include <json.hpp>

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

// 加载日志文件（记录链接到发布时间的映射）, 如果不存在，则返回空 JSON 对象
json loadLog(const std::string& logFilename) {
    json logData;
    std::ifstream logFile(logFilename);
    if (logFile.is_open()){
        try {
            logFile >> logData;
        } catch (json::parse_error& e) {
            std::cerr << "日志文件解析错误: " << e.what() << std::endl;
        }
        logFile.close();
    } else {
        logData = json::object();
    }
    return logData;
}

// 保存日志文件
void saveLog(const json& logData, const std::string& logFilename) {
    std::ofstream logFile(logFilename);
    if (logFile.is_open()){
        logFile << logData.dump(4);  // 缩进4格格式化输出
        logFile.close();
    } else {
        std::cerr << "无法保存日志文件: " << logFilename << std::endl;
    }
}

#ifdef _WIN32
    #include <windows.h>
    // Windows 下使用 _mkgmtime 替代 timegm
    #define timegm _mkgmtime
#endif

int main(int argc, char* argv[]) {
    std::string jsonInputFilename = "api/games_name.json";
    std::string xmlOutputFilename = "rss.xml";
    std::string logFilename = "rss_log.json";

    // --- 1. 读取 JSON 数据 ---
    std::ifstream inputFile(jsonInputFilename);
    if (!inputFile.is_open()){
        std::cerr << "无法打开文件 " << jsonInputFilename << std::endl;
        return 1;
    }
    json jsonData;
    inputFile >> jsonData;
    inputFile.close();

    // --- 2. 加载日志 ---
    json logData = loadLog(logFilename);

    // --- 3. 尝试读取现有 rss.xml 中的发布时间（若存在） ---
    json xmlMap = readXmlPubDates(xmlOutputFilename);

    // 用于存储当前 JSON 中所有链接（便于后续删除日志中不存在的链接）
    std::set<std::string> jsonLinks;

    // --- 4. 生成 RSS XML 内容 ---
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
        std::string link = "https://flash.100713.xyz/" + name;
        jsonLinks.insert(link);

        // --- 判断发布时间：优先级：JSON > XML > 日志
        std::string pubDate;
        if (item.contains("pubDate")) {
            pubDate = item["pubDate"];
        } else if (xmlMap.contains(link)) {
            pubDate = xmlMap[link];
        } else if (logData.contains(link)) {
            pubDate = logData[link];
        } else {
            pubDate = getCurrentTime();
        }

        // 更新日志（若记录与将要使用的时间不一致）
        if (!logData.contains(link) || logData[link] != pubDate) {
            logData[link] = pubDate;
        }

        // 写入当前项到 RSS XML
        xmlContent << "    <item>\n";
        xmlContent << "      <title>" << name << "</title>\n";
        xmlContent << "      <link>" << link << "</link>\n";
        xmlContent << "      <description>" << desc << "</description>\n";
        xmlContent << "      <pubDate>" << pubDate << "</pubDate>\n";
        xmlContent << "    </item>\n";
    }

    // --- 删除日志中存在、但 JSON 中不存在的链接记录 ---
    std::vector<std::string> keysToRemove;
    for (auto it = logData.begin(); it != logData.end(); ++it) {
        const std::string& link = it.key();
        if (jsonLinks.find(link) == jsonLinks.end()) {
            keysToRemove.push_back(link);
        }
    }
    for (const auto& link : keysToRemove) {
        logData.erase(link);
    }

    xmlContent << "  </channel>\n";
    xmlContent << "</rss>\n";

    std::ofstream outputFile(xmlOutputFilename);
    if (!outputFile.is_open()){
        std::cerr << "无法创建文件 " << xmlOutputFilename << std::endl;
        return 1;
    }
    outputFile << xmlContent.str();
    outputFile.close();

    // --- 保存更新后的日志 ---
    saveLog(logData, logFilename);

    // 提示信息
    // 如果命令行参数中包含 "-c" 则在命令行输出；否则隐藏控制台窗口并弹出 MessageBoxW（不带警告图标）
    if (argc > 1 && std::strcmp(argv[1], "-c") == 0) {
        std::cout << "RSS 订阅链接文件生成完毕" << xmlOutputFilename << std::endl;
    } else {
#ifdef _WIN32
        HWND consoleWnd = GetConsoleWindow();
        if (consoleWnd != NULL) {
            ShowWindow(consoleWnd, SW_HIDE);
        }
        // 使用 MessageBoxW，仅带 OK 按钮，无警告图标（MB_OK）
        MessageBoxW(NULL, L"RSS 订阅链接文件生成完毕", L"OK!", MB_OK);
#else
        std::cout << "RSS 订阅链接文件生成完毕" << xmlOutputFilename << std::endl;
#endif
    }

    return 0;
}
