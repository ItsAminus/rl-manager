#include "../ScoreboardRows.h"
#include "../FeedNameRefresh.h"
#include <cassert>
#include <cstring>
#include <iostream>
using namespace career_scoreboard;
static void feedNameRefreshTests(){
    using career_feed::NameView;
    auto read=[](uintptr_t address,void* out,size_t size){std::memcpy(out,reinterpret_cast<void*>(address),size);return true;};
    auto write=[](uintptr_t address,const void* in,size_t size){std::memcpy(reinterpret_cast<void*>(address),in,size);return true;};
    wchar_t buffer[32]=L"archie";
    NameView field{reinterpret_cast<uintptr_t>(buffer),7,32};
    const auto address=reinterpret_cast<uintptr_t>(&field);
    // Regression: the engine's compare-and-publish updater skipped unchanged
    // "archie", leaving Flash's "Necto". The refresh forces that copy to run.
    std::wstring flash=L"Necto";
    career_feed::NameRefresh refresh;
    assert(refresh.begin(address,read,write));
    if(std::wstring(reinterpret_cast<wchar_t*>(field.text))!=L"archie"){
        std::wcscpy(buffer,L"archie");field.count=7;flash=buffer;
    }
    refresh.finish(read,write);
    assert(flash==L"archie"&&field.text==reinterpret_cast<uintptr_t>(buffer)&&field.count==7&&field.capacity==32);
    // No native updater: restore the original engine buffer and descriptor.
    assert(refresh.begin(address,read,write));refresh.finish(read,write);
    assert(std::wstring(buffer)==L"archie"&&field.count==7&&field.capacity==32);
    // A longer pro name reallocates the destination. Never read/free/write the
    // old allocation after the engine takes ownership of its new result.
    assert(refresh.begin(address,read,write));
    wchar_t larger[64]=L"a-much-longer-career-name";
    const auto oldBuffer=field.text;
    field={reinterpret_cast<uintptr_t>(larger),25,64};
    auto guardedRead=[&](uintptr_t at,void* out,size_t size){assert(at!=oldBuffer);return read(at,out,size);};
    refresh.finish(guardedRead,write);
    assert(field.text==reinterpret_cast<uintptr_t>(larger)&&std::wstring(larger)==L"a-much-longer-career-name");
    // A nested refresh doesn't overwrite the outer call's saved contents.
    std::wcscpy(buffer,L"Oski");field={reinterpret_cast<uintptr_t>(buffer),5,32};
    career_feed::NameRefresh outer,inner;
    assert(outer.begin(address,read,write));assert(!inner.begin(address,read,write));
    inner.finish(read,write);outer.finish(read,write);
    assert(std::wstring(buffer)==L"Oski"&&field.count==5);
    // Malformed descriptors and write failures leave names untouched.
    field.count=33;assert(!refresh.begin(address,read,write));field.count=5;
    auto failDescriptor=[&](uintptr_t at,const void* in,size_t size){return at!=address&&write(at,in,size);};
    assert(!refresh.begin(address,read,failDescriptor));
    assert(std::wstring(buffer)==L"Oski"&&field.count==5);
}
int main(){
    feedNameRefreshTests();
    assert(playerNameBinding("PlayerName",3,3,12,12,"BonkDaddy","BonkDaddy","zen"));
    assert(playerNameBinding("PlayerName",4,4,12,12,"Necto (2)","Necto (2)","Oski"));
    assert(!playerNameBinding("PlayerIDString",3,3,12,12,"BonkDaddy","BonkDaddy","zen"));
    assert(!playerNameBinding("PlayerName",3,4,12,12,"Necto","Necto","Oski"));
    assert(!playerNameBinding("PlayerName",3,3,12,13,"Necto","Necto","Oski"));
    assert(playerNameBinding("PlayerName",3,3,12,12,"old-bot","Necto","Oski"));
    assert(playerNameBinding("PlayerName",3,3,12,12,"NECTO","reeho!","reeho!"));
    assert(!playerNameBinding("PlayerName",3,4,12,12,"NECTO","reeho!","reeho!"));
    assert(!playerNameBinding("PlayerName",-1,-1,12,12,"Necto","Necto","Oski"));
    assert(portraitInitial("zen")=="Z"&&portraitInitial("Oski")=="O");
    assert(portraitInitial("")=="?"&&portraitInitial("éclair")=="é");
    assert(hasSortedToken("Bot_Byte (2),Bot_Byte,Epic123","Bot_Byte"));
    assert(!hasSortedToken("Bot_Byte (2),Epic123","Bot_Byte"));
    std::vector<NativePlayer> native={{"zen","Bot_zen",0},{"nass","Bot_nass",0},{"my-account","Epic123",1}};
    std::vector<CareerPlayer> career={{0,0,"zen","zen-id","zen","zen.png","World Champion"},
        {1,0,"nass","nass-id","nass","nass.png","1v1 Champion"},
        {3,1,"my-account","vatira-id","Vatira","vatira.png","Major Champion"}};
    // Both bots can be Nexto: no bot-engine key exists in the mapping.
    auto rows=matchRows(native,career,"Bot_nass,Bot_zen,Epic123");
    assert(rows.size()==3);
    assert(rows[0].player.playerId=="nass-id"&&rows[0].player.photo=="nass.png"&&rows[0].teamRow==0);
    assert(rows[1].player.playerId=="zen-id"&&rows[1].player.photo=="zen.png"&&rows[1].teamRow==1);
    assert(rows[2].player.gamertag=="Vatira"&&rows[2].player.title=="Major Champion"&&rows[2].teamRow==0);
    auto reordered=matchRows(native,career,"Bot_zen,Epic123,Bot_nass");
    assert(reordered[0].player.photo=="zen.png"&&reordered[0].teamRow==0);
    assert(reordered[2].player.photo=="nass.png"&&reordered[2].teamRow==1);
    // Unknown IDs / partial rosters / previous games suppress the decoration.
    assert(matchRows(native,career,"Bot_zen,Bot_other,Epic123").empty());
    auto previous=career;previous[1].name="old-player";
    assert(matchRows(native,previous,"Bot_nass,Bot_zen,Epic123").empty());
    assert(matchRows(native,career,"Bot_nass_extra,Bot_zen,Epic123").empty());
    auto ambiguous=career;ambiguous.push_back(career[0]);
    assert(matchRows(native,ambiguous,"Bot_nass,Bot_zen,Epic123").empty());
    // Name collisions across teams still resolve to their separate career IDs.
    auto sameNative=native;sameNative[2].name="zen";
    auto sameCareer=career;sameCareer[2].name="zen";
    assert(matchRows(sameNative,sameCareer,"Bot_nass,Bot_zen,Epic123")[2].player.playerId=="vatira-id");
    // Hosted copies of one engine retain independent career identities.
    std::vector<NativePlayer> host={{"Byte","Bot_Byte",0,"10"},{"Byte (2)","Bot_Byte (2)",0,"20"}};
    std::vector<CareerPlayer> roles={{0,0,"Byte","zen-id","zen","zen.png","World Champion","10"},
        {1,0,"Byte (2)","nass-id","nass","nass.png","1v1 Champion","20"}};
    auto hostRows=matchRows(host,roles,"Bot_Byte (2),Bot_Byte");
    assert(hostRows.size()==2&&hostRows[0].player.playerId=="nass-id");
    roles[1].nativeId="30";
    assert(matchRows(host,roles,"Bot_Byte (2),Bot_Byte").empty());
    auto hd=layout(1920,1080,1,3,3),low=layout(1280,720,1,3,3);
    assert(std::abs(low.x-hd.x*2/3)<.01f&&std::abs(low.orangeY-hd.orangeY*2/3)<.01f);
    auto smallerUI=layout(1920,1080,.8f,3,3);
    assert(std::abs(smallerUI.spacing-hd.spacing*.8f)<.01f);
    assert(hd.blueY+2*hd.spacing+48*hd.unit<hd.orangeY);
    std::cout<<"PASS: feed republishing, destination ownership/rollback, role-specific portraits/titles, native order, human role, stale/ambiguous data, resolution and UI scaling\n";
}
