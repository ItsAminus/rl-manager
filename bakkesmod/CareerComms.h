#pragma once
#include <string>
#include <algorithm>
#include <cctype>
namespace career_comms {
// Native preset IDs are stable across display language and user D-pad bindings.
// The SDK's ServerSay_TA message is an FString; no chat data is overwritten.
inline int selection(std::string message){
    std::string key;for(unsigned char c:message)if(std::isalnum(c))key+=char(std::tolower(c));
    for(int n=1;n<=10;n++)if(key=="group1message"+std::to_string(n)||key=="chatgroup1message"+std::to_string(n))return n-1;
    if(key=="igotit")return 0;if(key=="needboost")return 1;if(key=="taketheshot")return 2;
    if(key=="defending")return 3;if(key=="goforit")return 4;if(key=="centering")return 5;
    if(key=="allyours")return 6;if(key=="inposition")return 7;if(key=="incoming")return 8;
    return -1;
}
inline bool tactical(int chat){return chat>=0&&chat<=8;}
}
