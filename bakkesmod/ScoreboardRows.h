#pragma once
#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstdint>
#include <string>
#include <vector>

namespace career_scoreboard {
// Only the presentation column of the verified PRI table may be rewritten.
// PlayerIDString is a primary key and must never be changed, even if it happens
// to contain a bot's display name.
inline bool playerNameBinding(const std::string& column,int row,int verifiedRow,
        uint64_t table,uint64_t verifiedTable,const std::string& value,
        const std::string& original,const std::string& career) {
    return column=="PlayerName"&&row>=0&&row==verifiedRow&&table==verifiedTable&&
        !career.empty(); // A verified row may contain a stale name from a reused Flash object.
}
struct NativePlayer { std::string name, token; int team; std::string nativeId; };
struct CareerPlayer {
    int slot, team;
    std::string name, playerId, gamertag, photo, title, nativeId;
};
struct Row { CareerPlayer player; int teamRow; };

inline bool hasSortedToken(const std::string& sortedIds,const std::string& token) {
    if(token.empty())return false;
    auto delimiter=[](char c){return c==','||c==';'||c=='|'||c=='"'||c=='['||c==']';};
    size_t search=0;
    while((search=sortedIds.find(token,search))!=std::string::npos){
        const auto end=search+token.size();
        if((search==0||delimiter(sortedIds[search-1]))&&(end==sortedIds.size()||delimiter(sortedIds[end])))return true;
        search=end;
    }
    return false;
}

inline std::string portraitInitial(const std::string& name) {
    if(name.empty())return "?";
    const unsigned char first=name[0];
    if(first<128)return std::string(1,(char)std::toupper(first));
    const size_t length=first<224?2:first<240?3:4;
    return name.size()>=length?name.substr(0,length):"?";
}

// Use the UI's actual sorted IDs, including its tie breaks. Never guess by score:
// a wrong guess would give a different player somebody else's face or award.
inline std::vector<Row> matchRows(const std::vector<NativePlayer>& native,
        const std::vector<CareerPlayer>& career, const std::string& sortedIds) {
    struct Located { CareerPlayer player; size_t order; };
    std::vector<Located> located;
    for(const auto& pri:native) {
        if(pri.team<0||pri.team>1||pri.token.empty())return {};
        size_t pos=std::string::npos,search=0;
        auto delimiter=[](char c){return c==','||c==';'||c=='|'||c=='"'||c=='['||c==']';};
        // Whole tokens only: Bot_Byte also occurs inside Bot_Byte (2).
        while((search=sortedIds.find(pri.token,search))!=std::string::npos){
            auto end=search+pri.token.size();
            if((search==0||delimiter(sortedIds[search-1]))&&
               (end==sortedIds.size()||delimiter(sortedIds[end]))){
                if(pos!=std::string::npos)return {};pos=search;
            }
            search=end;
        }
        if(pos==std::string::npos)return {};
        const CareerPlayer* match=nullptr;
        for(const auto& p:career)if(p.team==pri.team&&
            (p.nativeId.empty()?p.name==pri.name:p.nativeId==pri.nativeId)){if(match)return {};match=&p;}
        if(!match)return {};
        for(const auto& previous:located)if(previous.player.slot==match->slot||previous.order==pos)return {};
        located.push_back({*match,pos});
    }
    // An incomplete or previous-match roster must never decorate the new match.
    if(located.empty()||located.size()!=career.size())return {};
    std::sort(located.begin(),located.end(),[](const auto& a,const auto& b){return a.order<b.order;});
    int counts[2]={0,0};std::vector<Row> result;
    for(const auto& p:located)result.push_back({p.player,counts[p.player.team]++});
    return result;
}

struct Layout { float x, blueY, orangeY, spacing, unit; };
// Measured stock scoreboard coordinates at 1920x1080, independently expressed
// here from the public PlatformDisplay / RLProfilePictures positioning reference.
// https://github.com/SoulDaMeep/PlatformDisplay/blob/master/ScoreboardLookUp.txt
inline Layout layout(float width,float height,float ui,int blues,int oranges) {
    const float fit=width/height>1.5f ? .507f*height/548.f : .615f*width/1033.f;
    const float unit=fit*ui;
    const int difference=blues-oranges;
    const int emptyAdjustment=((blues==0)!=(oranges==0))?(difference>=0?1:-1):0;
    const float centerY=height*.5f+(32+32*(difference-emptyAdjustment))*unit;
    // The public platform-icon origin is 50px to the right of the native
    // avatar. Live verification places the actual replacement at avatar X.
    return {width*.5f+(-537-24+30.5f-50)*unit,
        centerY+(-67+6*(4-blues)-57*blues+9)*unit,
        centerY+43*unit,57*unit,unit};
}
}
