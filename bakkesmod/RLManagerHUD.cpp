// Native canvas rendering: no Chromium window, GPU model, or frame-time disk I/O.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <atomic>
#include <array>
#include <chrono>
#include <cmath>
#include <deque>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <thread>
#include <unordered_map>
#include "bakkesmod/plugin/bakkesmodplugin.h"
#include "bakkesmod/wrappers/ImageWrapper.h"
#include "bakkesmod/wrappers/GameEvent/ServerWrapper.h"
#include "bakkesmod/wrappers/GameEvent/ReplayDirectorWrapper.h"
#include "bakkesmod/wrappers/GameEvent/ReplaySoccarWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarWrapper.h"
#include "bakkesmod/wrappers/GameObject/BallWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/BoostWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarComponent/PrimitiveComponentWrapper.h"
#include "bakkesmod/wrappers/PlayerControllerWrapper.h"
#include "bakkesmod/wrappers/GameObject/Stats/StatEventWrapper.h"
#include "json.hpp"
#include "ScoreboardRows.h"
#include "FeedNameRefresh.h"
#include "NativeUI.h"
#include "CareerComms.h"
using json=nlohmann::json;

class RLManagerHUD : public BakkesMod::Plugin::BakkesModPlugin {
    std::atomic<bool> running{false};
    std::thread reader;
    std::mutex lock;
    std::shared_ptr<const json> latest;
    std::shared_ptr<const json> hostedPacket;
    std::shared_ptr<const json> pendingComms;
    uint64_t commsSequence=0;
    double lastCommsCapture=0;
    double nextCommsInput=0;
    double lastDirectComms=-100;
    std::array<bool,5> commsKeys{};
    std::array<int,4> commsKeyNames{};
    std::shared_ptr<std::atomic<bool>> tickAlive=std::make_shared<std::atomic<bool>>(true);
    std::string hostedSession;
    double hostedExpiry=0;
    double lastTeamRequest=0;
    std::unordered_map<std::string,std::shared_ptr<ImageWrapper>> images;
    std::unordered_map<std::string,std::vector<std::shared_ptr<ImageWrapper>>> imageSizes;
    struct Glyph {float advance,pad,x,y,width,height;};
    struct FontSet {float height;std::shared_ptr<ImageWrapper> image;std::unordered_map<std::string,Glyph> glyphs;};
    std::vector<FontSet> regularFonts,italicFonts;
    bool italic=false;
    std::filesystem::path folder;
    std::string session;
    float scale=1, left=0;
    bool detailed=false;
    bool scoreboardOpen=false, scoreboardReported=false, scoreboardUnavailable=false, closingReported=false;
    double scoreboardClosedAt=0;
    static double clockNow(){return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();}
    bool scoreboardVisible(){return scoreboardOpen||clockNow()-scoreboardClosedAt<.32;}
    std::string sortedIds;
    std::vector<career_scoreboard::NativePlayer> nativePlayers;
    struct NameAlias {std::string original,career;int team;};
    std::unordered_map<std::string,NameAlias> nameAliases;
    double lastNameSync=0;
    bool namesReported=false;
    std::string nameBindingError;
    std::unordered_map<uintptr_t,unsigned long> hiddenNameplates;
    bool hostedJoinReady=false;
    bool humanControlReported=false;
    std::string replayReported;
    struct FeedEntry {std::string receiver,victim,event,key,originalReceiver,originalVictim;int team,victimTeam;double created;std::string receiverId,victimId;};
    std::deque<FeedEntry> actionFeed;
    std::unordered_map<int,std::string> tickerPlayers;
    std::unordered_map<std::string,uintptr_t> playerUIObjects;
    std::unordered_map<std::string,bool> nativeFeedNames;
    std::unordered_map<std::string,double> feedNameRefresh;
    std::unordered_map<std::string,std::string> feedRefreshOutcome;
    std::unordered_map<std::string,bool> nativeCarNames;
    std::unordered_map<std::string,uintptr_t> nameplateObjects;
    std::string uiDiscovery;
    uintptr_t currentNativeHUD=0;
    std::unordered_map<uintptr_t,std::unordered_map<std::string,int32_t>> nativeFieldOffsets;
    std::unordered_map<uintptr_t,double> nameplateCheckedAt;
    double lastRenderAt=0;
    std::atomic<uint64_t> renderCalls{0},renderMicros{0},worstRenderMicros{0},worstFrameMicros{0};
    static void recordMaximum(std::atomic<uint64_t>& target,uint64_t value){
        auto previous=target.load();while(previous<value&&!target.compare_exchange_weak(previous,value)){}
    }
    using NameView=career_feed::NameView;
    struct NameInput {uintptr_t address=0;NameView original{};std::wstring value;bool borrowed=false;std::vector<std::pair<uintptr_t,NameView>> personaInputs;career_feed::NameRefresh destination;};
    std::deque<std::unique_ptr<NameInput>> nameInputs;
    // Datastore arguments have their own stack: publishing a bound column can
    // be nested inside PRI updates and ticker calls.
    std::deque<std::unique_ptr<NameInput>> boundNameInputs;
    double goalMessageAt=0;
    std::string goalMessageScorer;
    bool nativeGoalNames=false;
    bool goalLabelFallback=false;
    static constexpr const char* openEvent="Function TAGame.GFxData_GameEvent_TA.OnOpenScoreboard";
    static constexpr const char* closeEvent="Function TAGame.GFxData_GameEvent_TA.OnCloseScoreboard";
    static constexpr const char* sortEvent="Function TAGame.GFxData_Scoreboard_TA.UpdateSortedPlayerIDs";
    static constexpr const char* destroyEvent="Function TAGame.GameEvent_Soccar_TA.Destroyed";
    static constexpr const char* changeTeamEvent="Function TAGame.PlayerController_TA.ChangeTeam";
    static constexpr const char* serverTeamEvent="Function TAGame.PRI_TA.ServerChangeTeam";
    static constexpr const char* tickerEvent="Function TAGame.GFxHUD_TA.HandleStatTickerMessage";
    static constexpr const char* tickerUIEvent="Function TAGame.GFxData_GameEvent_TA.OnTickerEvent";
    static constexpr const char* priDataEvent="Function TAGame.GFxData_PRI_TA.UpdatePRIData";
    static constexpr const char* setPriEvent="Function TAGame.GFxData_PRI_TA.SetPRI";
    static constexpr const char* updateNameEvent="Function TAGame.GFxData_PRI_TA.UpdatePlayerName";
    static constexpr const char* boundStringEvent="Function ProjectX.GFxDataStore_X.SetStringValue";
    static constexpr const char* plateNameEvent="Function TAGame.GFxData_Nameplate_TA.UpdatePlayerName";
    static constexpr const char* plateTickEvent="Function TAGame.GFxData_Nameplate_TA.Tick";
    static constexpr const char* plateSetEvent="Function TAGame.GFxData_Nameplate_TA.SetNameplateComponent";
    static constexpr const char* plateGetEvent="Function TAGame.NameplateComponentCar_TA.GetPlayerName";
    static constexpr const char* hudNameEvent="Function TAGame.GFxHUD_TA.GetPlayerName";
    static constexpr const char* hudResolveEvent="Function TAGame.GFxHUD_TA.ResolvePlayerName";
    static constexpr const char* messageEvent="Function TAGame.GFxData_GameEvent_TA.OnGameMessage";
    static constexpr const char* receiveMessageEvent="Function TAGame.GFxHUD_TA.ReceiveMessage";
    static constexpr const char* hudOpenEvent="Function TAGame.GFxHUD_TA.OpenScoreboard";
    static constexpr const char* hudCloseEvent="Function TAGame.GFxHUD_TA.CloseScoreboard";
    static constexpr const char* messageNameEvent="Function TAGame.Message_TA.GetObjectText";
    static constexpr const char* messageTextEvent="Function TAGame.Message_TA.GetText";
    static constexpr const char* localChatEvent="Function TAGame.PlayerController_TA.ServerSay_TA";
    static constexpr const char* localChatInternalEvent="Function TAGame.PlayerController_TA.ServerSayInternal_TA";

    bool offlineMatch(){return gameWrapper->IsInGame()&&!gameWrapper->IsInOnlineGame()&&!gameWrapper->IsInFreeplay();}
    bool careerMatch(){
        if(offlineMatch())return true;
        if(hostedSession.empty()||gameWrapper->IsInFreeplay())return false;
        auto server=gameWrapper->GetCurrentGameState();
        return server&&server.IsPlayingLan();
    }
    static json vectorJson(Vector v){return json::array({v.X,v.Y,v.Z});}
    static json physics(ActorWrapper actor){
        auto rot=actor.GetRotation();
        return json{{"location",vectorJson(actor.GetLocation())},{"velocity",vectorJson(actor.GetVelocity())},
            {"angularVelocity",vectorJson(actor.GetAngularVelocity())},
            {"rotation",json::array({rot.Pitch*3.141592653589793/32768.,rot.Yaw*3.141592653589793/32768.,rot.Roll*3.141592653589793/32768.})}};
    }
    void pollHosted(){
        auto alive=tickAlive;
        if(!*alive)return;
        try{
            double now=std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();
            if(now>hostedExpiry){hostedSession.clear();return;}
            auto server=gameWrapper->GetCurrentGameState();
            // Opt-in export is restricted to the user's requested LAN match.
            // Never collect or control public matchmaking or ordinary online play.
            if(server&&server.IsPlayingLan()){
                auto local=gameWrapper->GetPlayerController();
                if(local&&now-lastTeamRequest>.5){auto pri=local.GetPRI();if(pri){
                    if(hostedJoinReady&&(pri.IsSpectator()||pri.GetTeamNum2()!=0||!pri.GetCar())){local.ChangeTeam(0);local.SetDefaultCameraMode();lastTeamRequest=now;}
                    else if(!hostedJoinReady&&!pri.IsSpectator()){local.Spectate();lastTeamRequest=now;}
                }}
                auto controlledCar=local?local.GetCar():CarWrapper(0);
                if(hostedJoinReady&&controlledCar&&!humanControlReported){local.SetUsingFreecam(false);local.SetDefaultCameraMode();humanControlReported=true;cvarManager->log("RL Manager: career human car is controlled locally on the assigned team.");}
                json players=json::array();
                for(auto pri:server.GetPRIs()){
                    if(!pri||pri.IsSpectator()||pri.GetPawnType()==1||pri.GetTeamNum2()>1)continue;
                    auto car=pri.GetCar();
                    // Hide arriving server bot labels immediately, even before
                    // the bridge has identified this particular career role.
                    const auto nativeId=std::to_string(pri.memory_address);
                    auto legacy=cvarManager->getCvar("rlm_legacy_nameplates");
                    if(pri.GetbBot()&&car&&!nativeCarNames[nativeId]&&legacy&&legacy.getBoolValue())hideEngineNameplate(car);
                    const auto displayName=pri.GetPlayerName().ToString();
                    const auto alias=nameAliases.find(nativeId);
                    // The join/engine verifier sees the original server identity.
                    // Presentation names must not break hosted roster binding.
                    json p={{"nativeId",nativeId},{"name",alias==nameAliases.end()?displayName:alias->second.original},
                        {"displayName",displayName},
                        {"locallyControlled",bool(car)&&bool(controlledCar)&&car.memory_address==controlledCar.memory_address},
                        {"team",pri.GetTeamNum2()},{"isBot",bool(pri.GetbBot())},
                        {"score",pri.GetMatchScore()},{"goals",pri.GetMatchGoals()},{"assists",pri.GetMatchAssists()},
                        {"saves",pri.GetMatchSaves()},{"shots",pri.GetMatchShots()},{"demolitions",pri.GetMatchDemolishes()},
                        {"touches",pri.GetBallTouches()},{"demolished",!bool(car)}};
                    if(car){p["physics"]=physics(car);auto boost=car.GetBoostComponent();p["boost"]=boost?boost.GetCurrentBoostAmount()*100.f:0.f;p["grounded"]=bool(car.GetbOnGround());}
                    players.push_back(std::move(p));
                }
                json scores=json::array();for(auto team:server.GetTeams())scores.push_back(team.GetScore());
                auto ball=server.GetBall();
                if(ball&&scores.size()==2){
                    json replay=json::object();auto camera=gameWrapper->GetCamera();
                    replay["camera"]=camera?camera.GetCameraState():std::string{};
                    auto director=server.GetReplayDirector();replay["director"]=bool(director);
                    if(director){auto score=director.GetReplayScoreData();replay["scorerId"]=std::to_string(score.ScoredBy);auto recording=director.GetReplay();replay["state"]=recording?recording.GetReplayState():-1;}
                    auto data=std::make_shared<const json>(json{{"session",hostedSession},{"updated",now},{"pid",GetCurrentProcessId()},
                        {"remaining",server.GetSecondsRemaining()},{"elapsed",server.GetTotalGameTimePlayed()},
                        {"overtime",bool(server.GetbOverTime())},{"ended",bool(server.GetbMatchEnded())},
                        {"active",bool(server.GetbRoundActive())},{"scores",scores},{"players",players},
                        {"ball",physics(ball)},{"touchTime",ball.GetLastTouchTime()},{"replay",replay}});
                    std::lock_guard<std::mutex> guard(lock);hostedPacket=data;
                }
            }
        }catch(const std::exception&){}
        auto id=hostedSession;
        gameWrapper->SetTimeout([this,alive,id](GameWrapper*){if(*alive&&hostedSession==id&&!id.empty())pollHosted();},.02f);
    }
    void armHosted(){
        try{
            std::ifstream file(folder/"host-session.json");auto config=json::parse(file);
            if(config.value("pid",0u)!=GetCurrentProcessId())return;
            double now=std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();
            double expiry=config.at("expires").get<double>();
            if(expiry<=now||expiry>now+1800)return;
            auto id=config.at("session").get<std::string>();if(id.size()<16||id.size()>128)return;
            bool newSession=hostedSession!=id;hostedSession=id;hostedExpiry=expiry;hostedJoinReady=false;humanControlReported=false;
            resetScoreboard();if(newSession)pollHosted();
            cvarManager->log("RL Manager: Rocket Host LAN telemetry armed for this career match.");
        }catch(const std::exception&){cvarManager->log("RL Manager: invalid Rocket Host session; telemetry not armed.");}
    }
    void restoreNameplates(){
        auto server=gameWrapper->GetCurrentGameState();
        if(server)for(auto pri:server.GetPRIs()){if(!pri)continue;auto car=pri.GetCar();if(!car)continue;auto mesh=car.GetNameplateMeshComponent();if(!mesh)continue;auto original=hiddenNameplates.find(mesh.memory_address);if(original!=hiddenNameplates.end()){mesh.SetHiddenGame(original->second);auto owner=bool(mesh.GetbOwnerNoSee());mesh.SetOwnerNoSee(!owner);mesh.SetOwnerNoSee(owner);}}
        hiddenNameplates.clear();
    }
    void hideEngineNameplate(CarWrapper car){
        auto mesh=car.GetNameplateMeshComponent();if(!mesh)return;
        bool refresh=hiddenNameplates.emplace(mesh.memory_address,mesh.GetHiddenGame()).second||!mesh.GetHiddenGame();mesh.SetHiddenGame(1);
        if(refresh){auto owner=bool(mesh.GetbOwnerNoSee());mesh.SetOwnerNoSee(!owner);mesh.SetOwnerNoSee(owner);}
    }
    void restoreEngineNameplate(CarWrapper car){
        auto mesh=car.GetNameplateMeshComponent();if(!mesh)return;auto original=hiddenNameplates.find(mesh.memory_address);if(original==hiddenNameplates.end())return;
        mesh.SetHiddenGame(original->second);auto owner=bool(mesh.GetbOwnerNoSee());mesh.SetOwnerNoSee(!owner);mesh.SetOwnerNoSee(owner);hiddenNameplates.erase(original);
    }
    void resetScoreboard(){restoreNameplates();currentNativeHUD=0;uiDiscovery.clear();scoreboardOpen=false;scoreboardClosedAt=0;sortedIds.clear();nativePlayers.clear();scoreboardReported=false;scoreboardUnavailable=false;nameAliases.clear();namesReported=false;lastNameSync=0;nameBindingError.clear();replayReported.clear();actionFeed.clear();tickerPlayers.clear();playerUIObjects.clear();nativeFeedNames.clear();feedNameRefresh.clear();feedRefreshOutcome.clear();nativeCarNames.clear();nameplateObjects.clear();nameplateCheckedAt.clear();lastRenderAt=0;goalLabelFallback=false;goalMessageAt=0;goalMessageScorer.clear();}
    std::string careerName(const std::string& nativeId){
        auto alias=nameAliases.find(nativeId);if(alias!=nameAliases.end())return alias->second.career;
        std::shared_ptr<const json> data;{std::lock_guard<std::mutex> guard(lock);data=latest;}
        if(!data)return {};
        try{for(const auto& live:data->at("players"))if(live.value("nativeId",std::string{})==nativeId){
            auto side=live.value("team",-1);if(side<0||side>1)return {};
            auto id=live.value("playerId",std::string{});if(id.empty())return {};
            for(const auto& role:data->at("context").at(side?"orange":"blue").at("players"))
                if(role.value("playerId",std::string{})==id)return role.value("gamertag",std::string{});
        }}catch(const std::exception&){}
        return {};
    }
    bool feedEnabled(){auto enabled=cvarManager->getCvar("rlm_hud_enabled");return careerMatch()&&enabled&&enabled.getBoolValue();}
    template<class T> static bool readChecked(uintptr_t address,T& result){
        SIZE_T copied=0;return address&&ReadProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(address),&result,sizeof(T),&copied)&&copied==sizeof(T);
    }
    static bool readNameMemory(uintptr_t address,void* output,size_t size){
        SIZE_T copied=0;return address&&ReadProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(address),output,size,&copied)&&copied==size;
    }
    static bool writeNameMemory(uintptr_t address,const void* input,size_t size){
        SIZE_T written=0;return address&&WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(address),input,size,&written)&&written==size;
    }
    std::string objectName(uintptr_t object){
        int index=-1,number=-1;
        if(!object||!readChecked(object+0x48,index)||!readChecked(object+0x4C,number)||index<0||number!=0)return {};
        return gameWrapper->GetFNameByIndex(index);
    }
    int32_t nativeField(uintptr_t object,const std::string& name){
        uintptr_t type=0;if(!object||!readChecked(object+0x50,type)||!type)return -1;
        auto& fields=nativeFieldOffsets[type];const auto found=fields.find(name);if(found!=fields.end())return found->second;
        const auto offset=career_native_ui::property(object,name,readNameMemory,[this](uintptr_t address){return objectName(address);});
        fields.emplace(name,offset);return offset;
    }
    static bool nativeCall(uintptr_t object,uintptr_t function,void* params){
        uintptr_t vtable=0,entry=0;
        if(!readChecked(object,vtable)||!readChecked(vtable+67*sizeof(uintptr_t),entry))return false;
        MEMORY_BASIC_INFORMATION memory{};
        if(!VirtualQuery(reinterpret_cast<void*>(entry),&memory,sizeof(memory))||memory.State!=MEM_COMMIT||
           !(memory.Protect&(PAGE_EXECUTE|PAGE_EXECUTE_READ|PAGE_EXECUTE_READWRITE|PAGE_EXECUTE_WRITECOPY)))return false;
        __try { reinterpret_cast<void(*)(void*,void*,void*)>(entry)(reinterpret_cast<void*>(object),reinterpret_cast<void*>(function),params); }
        __except(EXCEPTION_EXECUTE_HANDLER){return false;}
        return true;
    }
    bool publishNativeName(uintptr_t row,const std::string& name){
        if(!row||!feedEnabled()||name.empty())return false;
        uintptr_t shell=0,store=0;career_native_ui::SetStringParams params;
        if(!readChecked(row+0x60,params.table)||!params.table||!readChecked(row+0x90,params.row)||params.row<0||params.row>128||
           !readChecked(row+0x88,shell)||!shell||!readChecked(shell+0xD0,store)||!store)return false;
        params.column=gameWrapper->GetFNameIndexByString("PlayerName");
        if(params.column<0||gameWrapper->GetFNameByIndex(params.column)!="PlayerName")return false;
        const auto function=career_native_ui::method(store,"GFxDataStore_X","SetStringValue",sizeof(params),readNameMemory,[this](uintptr_t address){return objectName(address);});
        if(!function)return false;
        const int length=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),nullptr,0);if(length<1||length>128)return false;
        std::vector<wchar_t> text(length+1,0);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),text.data(),length);
        params.value={reinterpret_cast<uintptr_t>(text.data()),length+1,length+1};
        return nativeCall(store,function,&params);
    }
    void recoverCurrentUI(){
        auto field=[this](uintptr_t object,const std::string& name){return nativeField(object,name);};
        auto isHUD=[this](uintptr_t object){return object&&career_native_ui::derives(object,"GFxHUD_TA",readNameMemory,[this](uintptr_t address){return objectName(address);});};
        uintptr_t hud=isHUD(currentNativeHUD)?currentNativeHUD:0;
        auto controller=gameWrapper->GetPlayerController();
        if(!hud&&controller)for(uintptr_t offset:{uintptr_t(0x4F8),uintptr_t(0x500)}){uintptr_t candidate=0;if(readChecked(controller.memory_address+offset,candidate)&&isHUD(candidate)){hud=candidate;break;}}
        if(!hud)return;
        currentNativeHUD=hud;
        struct Array {uintptr_t data;int32_t count,capacity;};Array rows{};
        auto valid=[](const Array& a){return a.data&&a.count>=0&&a.count<=128&&a.capacity>=a.count&&a.capacity<=1024;};
        const auto priOffset=field(hud,"PRIData");
        if(priOffset>=0&&readChecked(hud+priOffset,rows)&&valid(rows))for(int i=0;i<rows.count;i++){uintptr_t row=0;if(readChecked(rows.data+i*sizeof(uintptr_t),row)&&row)capturePRIData(ActorWrapper(row));}
        uintptr_t manager=0;
        int plates=-1;
        const auto managerOffset=field(hud,"NameplatesManager");
        if(managerOffset>=0)readChecked(hud+managerOffset,manager);
        const auto rowsOffset=manager?field(manager,"NameplateRows"):-1;
        if(rowsOffset>=0&&readChecked(manager+rowsOffset,rows)&&valid(rows)){
            plates=rows.count;for(int i=0;i<rows.count;i++){uintptr_t row=0;if(readChecked(rows.data+i*sizeof(uintptr_t),row)&&row)captureNameplate(ActorWrapper(row),true);}
        }
        uintptr_t type=0;readChecked(hud+0x50,type);
        uintptr_t managerType=0;if(manager)readChecked(manager+0x50,managerType);
        const auto status=objectName(type)+"; manager="+objectName(managerType)+" "+std::to_string(manager)+" @"+std::to_string(managerOffset)+"; rows offset="+std::to_string(rowsOffset)+"; plate rows="+std::to_string(plates)+"; verified plates="+std::to_string(nameplateObjects.size());
        if(status!=uiDiscovery){uiDiscovery=status;cvarManager->log("RL Manager native UI discovery: "+status);}
    }
    uintptr_t verifiedNameRow(uintptr_t priId){
        auto found=playerUIObjects.find(std::to_string(priId));if(found==playerUIObjects.end())return 0;
        int row=-1;uintptr_t id=0,shell=0,store=0;uint64_t table=0;
        if(!readChecked(found->second+0x140,id)||id!=priId||!readChecked(found->second+0x90,row)||row<0||row>128||
           !readChecked(found->second+0x60,table)||!table||!readChecked(found->second+0x88,shell)||!shell||
           !readChecked(shell+0xD0,store)||!store)return 0;
        auto binding=tickerPlayers.find(row);if(binding==tickerPlayers.end()||binding->second!=found->first)return 0;
        return found->second;
    }
    void refreshFeedName(uintptr_t priId){
        if(!priId||!feedEnabled())return;
        auto alias=nameAliases.find(std::to_string(priId));if(alias==nameAliases.end())return;
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;
        PriWrapper target(0);for(auto pri:server.GetPRIs())if(pri&&pri.memory_address==priId){target=pri;break;}
        if(!target)return;
        const auto row=verifiedNameRow(priId);if(!row)return;
        const bool published=publishNativeName(row,alias->second.career);
        auto& previous=feedRefreshOutcome[std::to_string(priId)];
        const auto result=published?"published":"failed";
        nativeFeedNames[std::to_string(priId)]=published;
        if(previous!=result){previous=result;cvarManager->log("RL Manager native feed text "+std::string(result)+": "+alias->second.career);}
    }
    static std::string readString(uintptr_t address){
        struct FStringView{uintptr_t text;int32_t count,capacity;};FStringView field{};
        if(!readChecked(address,field)||!field.text||field.count<1||field.count>1024||field.capacity<field.count)return {};
        std::vector<wchar_t> buffer(field.count);SIZE_T copied=0;
        if(!ReadProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(field.text),buffer.data(),buffer.size()*sizeof(wchar_t),&copied)||copied!=buffer.size()*sizeof(wchar_t)||buffer.back()!=0)return {};
        return utf8(std::wstring(buffer.data(),buffer.size()-1));
    }
    void captureLocalComms(PlayerControllerWrapper caller,void* params){
        if(!offlineMatch()||!params)return;
        if(clockNow()-lastDirectComms<1.5)return;
        auto local=gameWrapper->GetPlayerController();if(!local||local.memory_address!=caller.memory_address)return;
        const int chat=career_comms::selection(readString(reinterpret_cast<uintptr_t>(params)));
        queueLocalComms(chat);
    }
    void queueLocalComms(int chat){
        if(!offlineMatch()||gameWrapper->IsPaused())return;
        auto local=gameWrapper->GetPlayerController();if(!local)return;
        if(!career_comms::tactical(chat))return;
        std::shared_ptr<const json> data;{std::lock_guard<std::mutex> guard(lock);data=latest;}
        const auto wall=std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();
        if(!data||!data->contains("context")||!data->at("context").value("localComms",false)||wall-data->value("updated",0.)>2||data->value("ended",false)||data->value("kickoff",false))return;
        auto pri=local.GetPRI();if(!pri||pri.IsSpectator()||pri.GetTeamNum2()>1)return;
        const auto now=clockNow();if(now-lastCommsCapture<1.5)return;lastCommsCapture=now;
        int sender=-1;for(const auto& p:data->at("players"))if(!p.value("is_bot",true)&&p.value("team",-1)==pri.GetTeamNum2()){if(sender!=-1)return;sender=p.value("slot",-1);}
        if(sender<0)return;
        auto command=std::make_shared<const json>(json{{"session",data->value("session",std::string{})},{"sequence",++commsSequence},{"sender",sender},{"team",pri.GetTeamNum2()},{"quickChat",chat},{"created",wall}});
        {std::lock_guard<std::mutex> guard(lock);pendingComms=command;}
        cvarManager->log("RL Manager career command captured: "+std::to_string(chat));
    }
    void pollLocalComms(){
        const auto now=clockNow();if(now<nextCommsInput)return;nextCommsInput=now+.025;
        DWORD foreground=0;GetWindowThreadProcessId(GetForegroundWindow(),&foreground);
        if(foreground!=GetCurrentProcessId()||!offlineMatch()||gameWrapper->IsPaused()||gameWrapper->IsCursorVisible()){commsKeys.fill(false);return;}
        // Read game input directly. Exhibition matches can disable the chat
        // transport completely, so sending/receiving a chat is not required.
        const char* names[]={"XboxTypeS_DPad_Up","XboxTypeS_DPad_Down","XboxTypeS_DPad_Right","XboxTypeS_DPad_Left"};
        const int commands[]={4,3,5,8,7};
        for(int i=0;i<5;i++){
            bool pressed=(GetAsyncKeyState(VK_F1+i)&0x8000)!=0;
            if(i<4){if(commsKeyNames[i]<=0)commsKeyNames[i]=gameWrapper->GetFNameIndexByString(names[i]);if(commsKeyNames[i]>0)pressed=pressed||gameWrapper->IsKeyPressed(commsKeyNames[i]);}
            if(pressed&&!commsKeys[i]){lastDirectComms=now;queueLocalComms(commands[i]);}
            commsKeys[i]=pressed;
        }
    }
    void drawComms(CanvasWrapper& c,const json& data){
        pollLocalComms();
        if(scoreboardVisible())return;
        if(!data.contains("comms")||!data["comms"].is_object()){
            if(data.contains("context")&&data["context"].value("localComms",false)&&!data.value("ended",false)){
                const auto oldScale=scale,oldLeft=left;scale=std::min(c.GetSize().Y/1080.f,c.GetSize().X/1920.f);left=0;
                const auto y=c.GetSize().Y/scale-145;box(c,24,y,630,28,12,21,17,205);
                text(c,"D-PAD: UP PRESS / DOWN DEFEND / RIGHT PASS / LEFT DEMO   (F1-F4 / F5 RESET)",34,y+7,.57,205,225,207,610);scale=oldScale;left=oldLeft;
            }
            return;
        }
        const auto& info=data["comms"];auto oldScale=scale,oldLeft=left;
        scale=std::min(c.GetSize().Y/1080.f,c.GetSize().X/1920.f);left=0;
        float y=c.GetSize().Y/scale-220;auto status=info.value("state",std::string{});
        int r=status=="unconfirmed"?238:status=="accepted"?169:237,g=status=="unconfirmed"?125:status=="accepted"?229:207,b=status=="accepted"?157:109;
        box(c,24,y,450,96,12,21,17,230);box(c,24,y,3,96,r,g,b);
        text(c,status=="accepted"?"TEAM COMMS CONFIRMED":status=="unconfirmed"?"NO TEAMMATE CONFIRMATION":"SENDING TEAM COMMS",40,y+10,.65,r,g,b,416);
        const auto seconds=static_cast<int>(std::ceil(info.value("remaining",0.)));
        text(c,info.value("label",std::string{})+(seconds>0?" · "+std::to_string(seconds)+"s":""),40,y+30,1.15,239,245,240,416);
        std::string detail=status=="unconfirmed"?"Retry after a moment.":"Waiting for your teammates…";
        if(status=="accepted"){detail.clear();for(const auto& name:info.at("acceptedBy")){if(!detail.empty())detail+=" · ";detail+=name.get<std::string>();}}
        text(c,detail,40,y+66,.7,179,198,184,416);scale=oldScale;left=oldLeft;
    }
    void capturePRIData(ActorWrapper caller){
        // UI rows can be created before the hosted career handshake is armed.
        // Remember verified identities then; presentation edits remain career-only.
        if(!caller)return;
        uintptr_t outer=0;
        if(readChecked(caller.memory_address+0x40,outer)&&outer&&career_native_ui::derives(outer,"GFxHUD_TA",readNameMemory,[this](uintptr_t address){return objectName(address);}))currentNativeHUD=outer;
        int index=-1;uintptr_t id=0;
        // Read the UI row's own index and PRI, rather than pairing separate
        // events by time. Offsets are from the public GFxData_PRI_TA layout.
        if(!readChecked(caller.memory_address+0x90,index)||index<0||index>128||!readChecked(caller.memory_address+0x140,id))return;
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;
        for(auto pri:server.GetPRIs())if(pri&&pri.memory_address==id){
            auto key=std::to_string(id);tickerPlayers[index]=key;playerUIObjects[key]=caller.memory_address;
            // The host's bot account title must never peek through our fixed
            // IRL-title row, including while the native board fades closed.
            if(!feedEnabled())return;
            const auto titleAddress=caller.memory_address+0x118;NameView title{};
            if(readChecked(titleAddress,title)&&title.text&&title.count>1&&title.count<=title.capacity&&title.capacity<=1024){
                wchar_t empty=0;SIZE_T written=0;
                if(WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(title.text),&empty,sizeof(empty),&written)&&written==sizeof(empty)){
                    title.count=1;WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(titleAddress),&title,sizeof(title),&written);
                }
            }
            return;
        }
        tickerPlayers.erase(index);
    }
    void prepareBoundPlayerName(ActorWrapper caller,void* params){
        auto frame=std::make_unique<NameInput>();auto* input=frame.get();boundNameInputs.push_back(std::move(frame));
        if(!caller||!params||!feedEnabled())return;
        const auto address=reinterpret_cast<uintptr_t>(params);
        uint64_t table=0;int row=-1,column=-1,columnNumber=-1;
        if(!readChecked(address,table)||!readChecked(address+8,row)||!readChecked(address+12,column)||!readChecked(address+16,columnNumber)||column<0||columnNumber!=0)return;
        const auto columnName=gameWrapper->GetFNameByIndex(column);
        if(columnName!="PlayerName")return;
        const auto current=readString(address+0x18);
        std::vector<std::pair<std::string,uintptr_t>> objects(playerUIObjects.begin(),playerUIObjects.end());
        objects.insert(objects.end(),nameplateObjects.begin(),nameplateObjects.end());
        for(const auto& object:objects){
            const auto alias=nameAliases.find(object.first);if(alias==nameAliases.end())continue;
            uint64_t actualTable=0;int actualRow=-1;uintptr_t pri=0,shell=0,store=0;
            const bool plate=career_native_ui::derives(object.second,"GFxData_Nameplate_TA",readNameMemory,[this](uintptr_t address){return objectName(address);});
            if(plate){auto owner=nameplatePRI(ActorWrapper(object.second));if(!owner||std::to_string(owner.memory_address)!=object.first)continue;}
            else if(!readChecked(object.second+0x140,pri)||std::to_string(pri)!=object.first)continue;
            if(!readChecked(object.second+0x60,actualTable)||!readChecked(object.second+0x90,actualRow)||
               !readChecked(object.second+0x88,shell)||!shell||!readChecked(shell+0xD0,store)||store!=caller.memory_address)continue;
            if(!career_scoreboard::playerNameBinding(columnName,row,actualRow,table,actualTable,current,alias->second.original,alias->second.career))continue;
            const auto& name=alias->second.career;
            int length=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),nullptr,0);if(length<1)return;
            input->address=address+0x18;
            if(!readChecked(input->address,input->original))return;
            input->value.resize(length+1);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),input->value.data(),length);input->value[length]=0;
            NameView loan{reinterpret_cast<uintptr_t>(input->value.data()),length+1,length+1};SIZE_T written=0;
            input->borrowed=bool(WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(input->address),&loan,sizeof(loan),&written))&&written==sizeof(loan);
            if(input->borrowed){
                if(!nativeFeedNames[object.first])cvarManager->log("RL Manager native name publication input: "+current+" -> "+name);
                nativeFeedNames[object.first]=true;
            }
            return;
        }
    }
    void restoreBoundPlayerName(){
        if(boundNameInputs.empty())return;auto input=std::move(boundNameInputs.back());boundNameInputs.pop_back();
        if(input->borrowed){SIZE_T written=0;WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(input->address),&input->original,sizeof(input->original),&written);}
    }
    void lendNameSource(NameInput* input,uintptr_t address,const NameView& loan){
        if(!address)return;
        for(const auto& saved:input->personaInputs)if(saved.first==address)return;
        NameView original{};
        if(!readChecked(address,original)||!original.text||original.count<1||original.count>original.capacity||original.capacity>1024)return;
        if(readString(address).empty())return;
        SIZE_T written=0;
        if(WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(address),&loan,sizeof(loan),&written)&&written==sizeof(loan))input->personaInputs.emplace_back(address,original);
    }
    void lendPersonaNames(NameInput* input,uintptr_t row,bool nameplate,const NameView& loan){
        // All four names can be selected by platform/anonymization settings.
        // Only personas reached through an identity-verified UI row are lent.
        for(uintptr_t offset:nameplate?std::vector<uintptr_t>{0xE8}:std::vector<uintptr_t>{0x218,0x220}){
            uintptr_t persona=0;if(!readChecked(row+offset,persona)||!persona)continue;
            for(uintptr_t nameOffset:{uintptr_t(0x60),uintptr_t(0x70),uintptr_t(0x120),uintptr_t(0x130)})lendNameSource(input,persona+nameOffset,loan);
        }
    }
    void lendCarName(NameInput* input,PriWrapper pri,const NameView& loan){
        auto car=pri.GetCar();uintptr_t component=0,owner=0;
        if(car&&readChecked(car.memory_address+0xAC8,component)&&component&&readChecked(component+0xE0,owner)&&owner==car.memory_address)
            lendNameSource(input,component+0xA8,loan);
        auto row=nameplateObjects.find(std::to_string(pri.memory_address));
        if(row!=nameplateObjects.end()&&nameplatePRI(ActorWrapper(row->second)).memory_address==pri.memory_address)
            lendPersonaNames(input,row->second,true,loan);
    }
    void prepareUIName(ActorWrapper caller,bool nameplate=false,bool refresh=false){
        // Never overwrite PlayerName after the updater: that bypasses Flash
        // change detection. The engine owns and publishes its destination.
        // UpdatePlayerName makes an engine-owned copy of the PRI name. For a
        // longer career tag, lend the getter a stable input for that one call,
        // then restore its descriptor before any telemetry/network work.
        auto frame=std::make_unique<NameInput>();auto* input=frame.get();nameInputs.push_back(std::move(frame));
        if(!caller||!feedEnabled())return;
        uintptr_t priId=0;
        if(nameplate){auto pri=nameplatePRI(caller);if(!pri)return;priId=pri.memory_address;}
        else if(!readChecked(caller.memory_address+0x140,priId))return;
        auto alias=nameAliases.find(std::to_string(priId));if(alias==nameAliases.end())return;
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;
        PriWrapper target(0);for(auto pri:server.GetPRIs())if(pri&&pri.memory_address==priId){target=pri;break;}
        if(!target)return;
        const auto& name=alias->second.career;
        int length=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),nullptr,0);if(length<1)return;
        NameView ui{};if(!readChecked(caller.memory_address+(nameplate?0xA8:0x98),ui))return;
        // Public Engine.PlayerReplicationInfo.PlayerName layout. Validate
        // against the SDK getter before lending any temporary descriptor.
        input->address=target.memory_address+0x288;
        auto nativeName=target.GetPlayerName().ToString();
        if(!readChecked(input->address,input->original)||!input->original.text||input->original.count<1||input->original.count>input->original.capacity||input->original.capacity>1024||readString(input->address)!=nativeName||(nativeName!=alias->second.original&&nativeName!=alias->second.career))return;
        input->value.resize(length+1);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),input->value.data(),length);input->value[length]=0;
        NameView loan{reinterpret_cast<uintptr_t>(input->value.data()),length+1,length+1};SIZE_T written=0;
        input->borrowed=bool(WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(input->address),&loan,sizeof(loan),&written))&&written==sizeof(loan);
        if(input->borrowed){
            lendPersonaNames(input,caller.memory_address,nameplate,loan);
            if(nameplate)lendCarName(input,target,loan);
            if(refresh&&(nameplate||verifiedNameRow(priId)==caller.memory_address))
                input->destination.begin(caller.memory_address+(nameplate?0xA8:0x98),readNameMemory,writeNameMemory);
        }
    }
    void restoreUINameInput(){
        if(nameInputs.empty())return;auto input=std::move(nameInputs.back());nameInputs.pop_back();
        input->destination.finish(readNameMemory,writeNameMemory);
        if(input->borrowed){SIZE_T written=0;for(auto& item:input->personaInputs)WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(item.first),&item.second,sizeof(item.second),&written);WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(input->address),&input->original,sizeof(input->original),&written);}
    }
    void prepareMessageName(void* params){
        auto frame=std::make_unique<NameInput>();auto* input=frame.get();nameInputs.push_back(std::move(frame));
        if(!params||!feedEnabled())return;uintptr_t object=0;if(!readChecked(reinterpret_cast<uintptr_t>(params),object))return;
        auto alias=nameAliases.find(std::to_string(object));if(alias==nameAliases.end())return;
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;PriWrapper target(0);
        for(auto pri:server.GetPRIs())if(pri&&pri.memory_address==object){target=pri;break;}if(!target)return;
        const auto& name=alias->second.career;int length=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),nullptr,0);if(length<1)return;
        input->address=object+0x288;
        auto nativeName=target.GetPlayerName().ToString();
        if(!readChecked(input->address,input->original)||!input->original.text||input->original.count<1||input->original.count>input->original.capacity||input->original.capacity>1024||readString(input->address)!=nativeName||(nativeName!=alias->second.original&&nativeName!=alias->second.career))return;
        input->value.resize(length+1);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),input->value.data(),length);input->value[length]=0;
        NameView loan{reinterpret_cast<uintptr_t>(input->value.data()),length+1,length+1};SIZE_T written=0;
        input->borrowed=bool(WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(input->address),&loan,sizeof(loan),&written))&&written==sizeof(loan);
        auto ui=playerUIObjects.find(std::to_string(object));
        if(input->borrowed){
            if(ui!=playerUIObjects.end()&&verifiedNameRow(object)==ui->second)lendPersonaNames(input,ui->second,false,loan);
            lendCarName(input,target,loan);
        }
    }
    PriWrapper nameplatePRI(ActorWrapper caller){
        if(!caller||!careerMatch())return PriWrapper(0);
        uintptr_t component=0,carOwner=0;
        // GFxData_Nameplate.NameplateComponent and NameplateComponentCar.Car.
        // Check both directions against SDK-owned cars; never infer identity
        // from the bot family, row order or nearest vehicle.
        const auto componentOffset=nativeField(caller.memory_address,"NameplateComponent");
        if(componentOffset<0||!readChecked(caller.memory_address+componentOffset,component)||!component)return PriWrapper(0);
        const auto carOffset=nativeField(component,"Car");
        if(carOffset<0||!readChecked(component+carOffset,carOwner))return PriWrapper(0);
        auto server=gameWrapper->GetCurrentGameState();if(!server)return PriWrapper(0);
        for(auto pri:server.GetPRIs())if(pri){auto car=pri.GetCar();uintptr_t expected=0;const auto offset=car?nativeField(car.memory_address,"NameplateComponentCar"):-1;if(car&&car.memory_address==carOwner&&offset>=0&&readChecked(car.memory_address+offset,expected)&&expected==component)return pri;}
        return PriWrapper(0);
    }
    PriWrapper componentPRI(ActorWrapper caller){
        if(!caller||!feedEnabled())return PriWrapper(0);
        uintptr_t owner=0;const auto carOffset=nativeField(caller.memory_address,"Car");if(carOffset<0||!readChecked(caller.memory_address+carOffset,owner)||!owner)return PriWrapper(0);
        auto server=gameWrapper->GetCurrentGameState();if(!server)return PriWrapper(0);
        for(auto pri:server.GetPRIs())if(pri){auto car=pri.GetCar();uintptr_t component=0;
            const auto offset=car?nativeField(car.memory_address,"NameplateComponentCar"):-1;
            if(car&&car.memory_address==owner&&offset>=0&&readChecked(car.memory_address+offset,component)&&component==caller.memory_address)return pri;
        }
        return PriWrapper(0);
    }
    bool replaceNativeName(uintptr_t field,uintptr_t priId){
        if(!field||!feedEnabled())return false;
        auto alias=nameAliases.find(std::to_string(priId));if(alias==nameAliases.end())return false;
        const auto& name=alias->second.career;
        int length=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),nullptr,0);if(length<1)return false;
        std::wstring text(length,0);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),text.data(),length);
        return career_feed::replaceResult(field,text,readNameMemory,writeNameMemory);
    }
    void resolveHUDName(void* params){
        if(!params||!feedEnabled())return;
        struct Result {uintptr_t pri;NameView name;};Result value{};
        const auto address=reinterpret_cast<uintptr_t>(params);
        if(!readChecked(address,value)||!replaceNativeName(address+sizeof(uintptr_t),value.pri)||!readChecked(address,value))return;
        gameWrapper->OverrideParams(&value,sizeof(value));
    }
    void resolvePlateName(ActorWrapper caller,void* params){
        auto pri=componentPRI(caller);if(!pri||!params)return;
        const auto address=reinterpret_cast<uintptr_t>(params);NameView value{};
        if(!replaceNativeName(address,pri.memory_address)||!readChecked(address,value))return;
        gameWrapper->OverrideParams(&value,sizeof(value));
    }
    void captureNameplate(ActorWrapper caller,bool immediate=false){
        if(!caller||!feedEnabled())return;
        // Name/boost identities do not need six roster scans every video frame.
        // Actual name changes and new plate events still refresh immediately.
        const auto now=clockNow();auto checked=nameplateCheckedAt.find(caller.memory_address);
        if(!immediate&&checked!=nameplateCheckedAt.end()&&now-checked->second<.05)return;
        nameplateCheckedAt[caller.memory_address]=now;
        auto pri=nameplatePRI(caller);if(!pri)return;
        const auto id=std::to_string(pri.memory_address);auto alias=nameAliases.find(id);if(alias==nameAliases.end())return;
        if(nameplateObjects[id]!=caller.memory_address)nativeCarNames[id]=false;
        nameplateObjects[id]=caller.memory_address;
        // The C++ cache is not evidence that text reached Flash. Only the
        // explicit native datastore publication below releases a hidden plate.
        if(!nativeCarNames[id])return;
        restoreEngineNameplate(pri.GetCar());
        auto local=gameWrapper->GetPlayerController();auto own=local?local.GetPRI():PriWrapper(0);auto setting=cvarManager->getCvar("rlm_teammate_boost");
        if(own&&!own.IsSpectator()&&own.GetTeamNum2()==pri.GetTeamNum2()&&own.memory_address!=pri.memory_address&&setting&&setting.getBoolValue()){
            uint32_t flags=0;if(readChecked(caller.memory_address+0xBC,flags)&&!(flags&0x10)){flags|=0x10;SIZE_T written=0;WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(caller.memory_address+0xBC),&flags,sizeof(flags),&written);}
        }
    }
    void prepareTickerHUD(ActorWrapper caller,void* params){
        if(feedEnabled()&&caller){
            currentNativeHUD=caller.memory_address;
            // The HUD owns the authoritative GFx PRI rows (public SDK PRIData
            // array). Recover them after a game reset before the ticker copies
            // any names; row creation hooks alone miss reused UI objects.
            struct Rows {uintptr_t data;int32_t count,capacity;};Rows rows{};
            if(readChecked(caller.memory_address+0x468,rows)&&rows.data&&rows.count>=0&&rows.count<=128&&rows.capacity>=rows.count&&rows.capacity<=1024)
                for(int i=0;i<rows.count;i++){uintptr_t object=0;if(readChecked(rows.data+i*sizeof(uintptr_t),object)&&object)capturePRIData(ActorWrapper(object));}
            std::shared_ptr<const json> data;{std::lock_guard<std::mutex> guard(lock);data=latest;}
            if(data){try{
                const double now=std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();
                if(now-data->value("updated",0.)<2 && !data->value("ended",false)){lastNameSync=0;syncCareerNames(*data);}
            }catch(const std::exception&){} }
        }
        // HandleStatTickerMessage's public parameters: Receiver PRI, Victim PRI.
        // Stable loans live through the complete native dispatch, then restore.
        uintptr_t receiver=0,victim=0;
        if(params){readChecked(reinterpret_cast<uintptr_t>(params),receiver);readChecked(reinterpret_cast<uintptr_t>(params)+sizeof(uintptr_t),victim);}
        refreshFeedName(receiver);if(victim!=receiver)refreshFeedName(victim);
        prepareMessageName(params);
        prepareMessageName(params?reinterpret_cast<void*>(reinterpret_cast<uintptr_t>(params)+sizeof(uintptr_t)):nullptr);
    }
    void prepareTickerUI(void* params){
        captureNativeTicker(params);
        int receiver=-1,victim=-1;uintptr_t receiverPRI=0,victimPRI=0;
        if(params&&feedEnabled()){
            readChecked(reinterpret_cast<uintptr_t>(params)+0x18,receiver);readChecked(reinterpret_cast<uintptr_t>(params)+0x1c,victim);
            auto server=gameWrapper->GetCurrentGameState();if(server)for(auto pri:server.GetPRIs())if(pri){
                const auto id=std::to_string(pri.memory_address);auto a=tickerPlayers.find(receiver),b=tickerPlayers.find(victim);
                if(a!=tickerPlayers.end()&&a->second==id)receiverPRI=pri.memory_address;
                if(b!=tickerPlayers.end()&&b->second==id)victimPRI=pri.memory_address;
            }
        }
        refreshFeedName(receiverPRI);if(victimPRI!=receiverPRI)refreshFeedName(victimPRI);
        prepareMessageName(&receiverPRI);prepareMessageName(&victimPRI);
    }
    void captureNativeTicker(void* params){
        if(!params||!feedEnabled())return;
        int receiverIndex=-1,victimIndex=-1;
        if(!readChecked(reinterpret_cast<uintptr_t>(params)+0x18,receiverIndex)||!readChecked(reinterpret_cast<uintptr_t>(params)+0x1c,victimIndex))return;
        auto receiverId=tickerPlayers.find(receiverIndex),victimId=tickerPlayers.find(victimIndex);
        if(receiverId==tickerPlayers.end())return;
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;
        PriWrapper receiver(0),target(0);
        for(auto pri:server.GetPRIs())if(pri){auto id=std::to_string(pri.memory_address);if(id==receiverId->second)receiver=pri;if(victimIndex>=0&&victimId!=tickerPlayers.end()&&id==victimId->second)target=pri;}
        if(!receiver||receiver.GetTeamNum2()>1)return;
        auto name=careerName(receiverId->second);if(name.empty())return;
        auto event=readString(reinterpret_cast<uintptr_t>(params));
        auto original=[this](PriWrapper pri){auto a=nameAliases.find(std::to_string(pri.memory_address));return a==nameAliases.end()?pri.GetPlayerName().ToString():a->second.original;};
        auto victim=target?careerName(std::to_string(target.memory_address)):std::string{};
        FeedEntry item{name,victim,event,receiverId->second+":"+std::to_string(victimIndex)+":"+event,original(receiver),target?original(target):std::string{},receiver.GetTeamNum2(),target?target.GetTeamNum2():-1,clockNow(),receiverId->second,target?std::to_string(target.memory_address):std::string{}};
        // Every UI event occupies a native row, even when two identical shots
        // arrive together. Never deduplicate one and shift subsequent names.
        actionFeed.push_back(item);while(actionFeed.size()>5)actionFeed.pop_front();
        if(event=="Goal"){goalMessageAt=clockNow();goalMessageScorer=name;}
        cvarManager->log("RL Manager ticker identity: "+item.receiver+" / "+item.event+(item.victim.empty()?"":" / "+item.victim));
    }
    float textWidth(CanvasWrapper& c,const std::string& value,float size){
        auto font=fontFor(size);if(!font)return c.GetStringSize(value,size*scale,size*scale).X/scale;
        float width=0;
        for(size_t i=0;i<value.size();){unsigned char lead=value[i];size_t n=lead<128?1:lead<224?2:lead<240?3:4;
            auto found=font->glyphs.find(value.substr(i,n));i+=n;
            if(found!=font->glyphs.end())width+=found->second.advance/scale;}
        return width;
    }
    void drawTeammateBoost(CanvasWrapper& c){
        auto enabled=cvarManager->getCvar("rlm_teammate_boost");if(!enabled||!enabled.getBoolValue()||scoreboardVisible()||detailed)return;
        auto server=gameWrapper->GetCurrentGameState();auto controller=gameWrapper->GetPlayerController();
        if(!server||!controller||server.GetbMatchEnded()||!server.GetbRoundActive())return;
        auto own=controller.GetPRI();if(!own||own.IsSpectator()||own.GetTeamNum2()>1)return;
        auto savedScale=scale,savedLeft=left;auto screen=c.GetSize();
        scale=std::min(screen.Y/1080.f,screen.X/1920.f);left=26*scale;
        int row=0;float y=screen.Y/scale-246;
        for(auto pri:server.GetPRIs()){
            if(!pri||pri.memory_address==own.memory_address||pri.IsSpectator()||pri.GetTeamNum2()!=own.GetTeamNum2())continue;
            auto name=careerName(std::to_string(pri.memory_address));if(name.empty())continue;
            auto car=pri.GetCar();auto boost=car?car.GetBoostComponent():BoostWrapper(0);
            int amount=boost?std::clamp((int)std::lround(boost.GetCurrentBoostAmount()*100.f),0,100):0;
            float top=y+row++*48;box(c,0,top,240,41,11,19,28,210);
            text(c,name,10,top+1,1.15,236,241,250,176);
            text(c,car?std::to_string(amount):"DEMO",193,top+1,1.05,amount<20?255:237,amount<20?155:239,amount<20?92:247,46);
            box(c,10,top+29,220,5,44,55,67);
            if(amount)box(c,10,top+29,2.2f*amount,5,own.GetTeamNum2()?255:52,own.GetTeamNum2()?151:184,own.GetTeamNum2()?48:247);
        }
        scale=savedScale;left=savedLeft;
    }
    void syncCareerNames(const json& data){
        const double now=std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();
        if(now-lastNameSync<.25)return;lastNameSync=now;
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;
        struct Rename {PriWrapper pri;std::string nativeId,original,career;int team;};
        std::vector<Rename> changes;
        auto blocked=[this](const std::string& reason){if(nameBindingError!=reason){nameBindingError=reason;cvarManager->log("RL Manager car-name binding: "+reason);}};
        // Bind the whole current bot roster first. Duplicate hosted policies
        // use the join-verified PRI IDs, never a guessed bot slot or bot name.
        auto pris=server.GetPRIs();
        for(const auto& live:data.at("players")){
            const bool isBot=live.value("is_bot",false);
            const int side=live.value("team",-1);if(side<0||side>1)return;
            const auto playerId=live.value("playerId",std::string{});if(playerId.empty()){blocked("waiting for career player IDs");return;}
            const json* role=nullptr;
            for(const auto& p:data.at("context").at(side?"orange":"blue").at("players"))
                if(p.value("playerId",std::string{})==playerId){if(role)return;role=&p;}
            if(!role){blocked("missing roster role for "+playerId);return;}
            const auto desired=role->value("gamertag",std::string{});
            if(desired.empty()||desired.size()>128)return;
            const auto id=live.value("nativeId",std::string{}),name=live.value("name",std::string{});
            PriWrapper found(0);std::string actual;
            for(auto pri:pris){
                if(!pri||bool(pri.GetbBot())!=isBot||pri.GetTeamNum2()!=side)continue;
                auto key=std::to_string(pri.memory_address),current=pri.GetPlayerName().ToString();
                auto previous=nameAliases.find(key);
                const bool matches=id.empty()?(name==current||(previous!=nameAliases.end()&&previous->second.original==name)):id==key;
                if(matches){if(found){blocked("ambiguous native instance for "+desired);return;}found=pri;actual=current;}
            }
            if(!found){blocked("missing native instance for "+desired+" / "+id);return;}
            auto key=std::to_string(found.memory_address);
            for(const auto& p:changes)if(p.nativeId==key)return;
            auto previous=nameAliases.find(key);
            changes.push_back({found,key,previous==nameAliases.end()?actual:previous->second.original,desired,side});
        }
        if(changes.empty())return;
        for(const auto& target:changes)nameAliases[target.nativeId]={target.original,target.career,target.team};
        recoverCurrentUI();
        int verified=0;
        for(auto& target:changes){
            // Publish to the actual Flash-bound table on the current HUD.
            // Do not rename a network PRI or wait for an unbound notification.
            refreshFeedName(target.pri.memory_address);
            auto plate=nameplateObjects.find(target.nativeId);
            if(plate!=nameplateObjects.end()&&nameplatePRI(ActorWrapper(plate->second)).memory_address==target.pri.memory_address){
                const bool previous=nativeCarNames[target.nativeId];
                nativeCarNames[target.nativeId]=publishNativeName(plate->second,target.career);
                if(!previous&&nativeCarNames[target.nativeId])cvarManager->log("RL Manager native nameplate text published: "+target.career);
            }
            if(nativeFeedNames[target.nativeId]&&(nativeCarNames[target.nativeId]||!target.pri.GetCar()))verified++;
        }
        if(verified==(int)changes.size()&&!namesReported){
            namesReported=true;nameBindingError.clear();cvarManager->log("RL Manager: native text publication completed for "+std::to_string(verified)+" career players; live appearance requires visual verification.");
        }
        else if(verified!=(int)changes.size()&&!namesReported)blocked("native text publication incomplete for "+std::to_string(changes.size()-verified)+" players; no legacy labels enabled");
    }
    void drawCareerNameplates(CanvasWrapper& c){
        auto legacy=cvarManager->getCvar("rlm_legacy_nameplates");
        if(!legacy||!legacy.getBoolValue()){if(!hiddenNameplates.empty())restoreNameplates();return;}
        if(hiddenNameplates.empty()&&nameAliases.empty())return;
        auto server=gameWrapper->GetCurrentGameState();auto camera=gameWrapper->GetCamera();if(!server||!camera)return;
        auto eye=camera.GetLocation();auto rotation=camera.GetRotation();const float yaw=rotation.Yaw*3.14159265f/32768.f,pitch=rotation.Pitch*3.14159265f/32768.f;
        Vector forward{std::cos(pitch)*std::cos(yaw),std::cos(pitch)*std::sin(yaw),std::sin(pitch)};
        auto screen=c.GetSize();float savedScale=scale,savedLeft=left;bool savedItalic=italic;left=0;italic=false;
        int replaced=0;
        for(auto pri:server.GetPRIs()){
            if(!pri||!pri.GetbBot())continue;auto alias=nameAliases.find(std::to_string(pri.memory_address));if(alias==nameAliases.end()||(hostedSession.empty()&&pri.GetPlayerName().ToString()==alias->second.career))continue;
            auto car=pri.GetCar();if(!car)continue;auto mesh=car.GetNameplateMeshComponent();if(!mesh)continue;
            if(nativeCarNames[std::to_string(pri.memory_address)]){restoreEngineNameplate(car);continue;}
            hideEngineNameplate(car);
            if(!mesh.GetHiddenGame())continue;
            replaced++;
            // Keep the engine labels suppressed, but never draw world labels
            // over either player scoreboard.
            if(scoreboardVisible()||detailed)continue;
            auto position=car.GetLocation();position.Z+=170;auto delta=position-eye;
            if(delta.X*forward.X+delta.Y*forward.Y+delta.Z*forward.Z<20)continue;
            auto projected=c.ProjectF(position);if(!std::isfinite(projected.X)||!std::isfinite(projected.Y)||projected.X<0||projected.X>screen.X||projected.Y<0||projected.Y>screen.Y)continue;
            const float distance=std::sqrt(delta.X*delta.X+delta.Y*delta.Y+delta.Z*delta.Z);
            scale=std::min(screen.Y/1080.f,screen.X/1920.f)*std::clamp(3000.f/std::max(1.f,distance),.7f,1.15f);
            const auto& label=alias->second.career;const float width=std::clamp(30.f+label.size()*12.f,72.f,230.f);
            float x=projected.X/scale-width/2,y=projected.Y/scale-28;
            box(c,x,y,width,28,alias->second.team?243:32,alias->second.team?122:127,alias->second.team?35:235);
            centered(c,label,x,y+2,width,.95,255,255,255);
            auto setting=cvarManager->getCvar("rlm_teammate_boost");auto controller=gameWrapper->GetPlayerController();auto own=controller?controller.GetPRI():PriWrapper(0);
            if(setting&&setting.getBoolValue()&&own&&!own.IsSpectator()&&own.GetTeamNum2()==pri.GetTeamNum2()&&own.memory_address!=pri.memory_address){
                auto boost=car.GetBoostComponent();int amount=boost?std::clamp((int)std::lround(boost.GetCurrentBoostAmount()*100.f),0,100):0;
                box(c,x,y+28,width,15,12,23,35,225);
                if(amount)box(c,x,y+41,width*amount/100.f,3,105,216,255);
                centered(c,std::to_string(amount)+" BOOST",x,y+28,width,.65,227,241,255);
            }
        }
        scale=savedScale;left=savedLeft;italic=savedItalic;
        if(replaced&&!namesReported){namesReported=true;cvarManager->log("RL Manager: client career nameplates replace "+std::to_string(replaced)+" hosted bot labels.");}
    }
    static std::string utf8(const std::wstring& input){
        if(input.empty())return {};
        int length=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,input.data(),(int)input.size(),nullptr,0,nullptr,nullptr);
        if(length<=0)return {};
        std::string result(length,'\0');
        WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,input.data(),(int)input.size(),result.data(),length,nullptr,nullptr);
        return result;
    }
    void updateNativeOrder(ActorWrapper caller){
        sortedIds.clear();nativePlayers.clear();
        if(!careerMatch()||!caller)return;
        // GFx exposes no SDK accessor for SortedPlayerIDs. Read its FString only
        // at the UI's own update hook, with bounded, checked copies. Never write
        // to game memory. A game update changing this field fails closed.
        // Public reference: PlatformDisplay's ScoreboardObj / getSortedIds.
        struct FStringView {uintptr_t text;int32_t count,capacity;};
        FStringView field{};SIZE_T copied=0;
        if(!ReadProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(caller.memory_address+0xB0),&field,sizeof(field),&copied)||copied!=sizeof(field))return;
        if(!field.text||field.count<2||field.count>8192||field.capacity<field.count||field.capacity>65536)return;
        std::vector<wchar_t> buffer(field.count);
        if(!ReadProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(field.text),buffer.data(),buffer.size()*sizeof(wchar_t),&copied)||copied!=buffer.size()*sizeof(wchar_t)||buffer.back()!=L'\0')return;
        sortedIds=utf8(std::wstring(buffer.data(),buffer.size()-1));
        auto server=gameWrapper->GetCurrentGameState();if(!server){sortedIds.clear();return;}
        for(auto pri:server.GetPRIs()){
            if(!pri||pri.IsSpectator()||pri.GetPawnType()==1)continue;
            int team=pri.GetTeamNum2();if(team>1)continue;
            auto name=pri.GetPlayerName().ToString();
            auto token=pri.GetbBot()?"Bot_"+name:pri.GetUniqueIdWrapper().GetIdString();
            auto ui=playerUIObjects.find(std::to_string(pri.memory_address));
            if(ui!=playerUIObjects.end()){
                uintptr_t id=0;if(readChecked(ui->second+0x140,id)&&id==pri.memory_address){
                    auto currentToken=readString(ui->second+0xA8);
                    if(career_scoreboard::hasSortedToken(sortedIds,currentToken))token=currentToken;
                }
            }
            auto alias=nameAliases.find(std::to_string(pri.memory_address));
            if(pri.GetbBot()&&!career_scoreboard::hasSortedToken(sortedIds,token)&&alias!=nameAliases.end()){
                const auto original="Bot_"+alias->second.original;
                if(career_scoreboard::hasSortedToken(sortedIds,original))token=original;
                else if(career_scoreboard::hasSortedToken(sortedIds,"Bot_"+alias->second.career))token="Bot_"+alias->second.career;
            }
            // Local telemetry can still contain the unrenamed native name.
            if(alias!=nameAliases.end())name=alias->second.original;
            nativePlayers.push_back({name,token,team,std::to_string(pri.memory_address)});
        }
    }
    std::vector<career_scoreboard::Row> scoreboardRows(const json& data){
        const auto& context=data.at("context");
        std::vector<career_scoreboard::CareerPlayer> career;
        for(const auto& live:data.at("players")){
            int slot=live.value("slot",-1),side=live.value("team",-1);
            if(side<0||side>1||slot<0)return {};
            const auto& team=context.at(side?"orange":"blue");
            auto id=live.value("playerId",std::string{});if(id.empty())return {};
            const json* found=nullptr;
            for(const auto& p:team.at("players"))if(p.value("playerId",std::string{})==id){if(found)return {};found=&p;}
            if(!found)return {};
            const auto& role=*found;
            career.push_back({slot,side,live.value("name",std::string{}),role.value("playerId",std::string{}),
                role.value("gamertag",std::string{}),role.value("photo",std::string{}),role.value("title",std::string{}),live.value("nativeId",std::string{})});
        }
        return career_scoreboard::matchRows(nativePlayers,career,sortedIds);
    }
    void drawScoreboard(CanvasWrapper& c,const json& data){
        if(!scoreboardVisible())return;
        auto enabled=cvarManager->getCvar("rlm_scoreboard_enabled");if(!enabled||!enabled.getBoolValue())return;
        const auto rows=scoreboardRows(data);
        if(!scoreboardOpen&&!rows.empty()&&!closingReported){closingReported=true;cvarManager->log("RL Manager scoreboard: career rows retained through the native closing fade.");}
        if(rows.empty()){
            if(!scoreboardUnavailable){scoreboardUnavailable=true;cvarManager->log("RL Manager scoreboard: waiting for verified native row order and current career roster; no guessed portraits.");}
            return;
        }
        int counts[2]={0,0};for(const auto& row:rows)counts[row.player.team]++;
        const auto screen=c.GetSize();
        float ui=gameWrapper->GetDisplayScale()*gameWrapper->GetInterfaceScale();
        if(!std::isfinite(ui)||ui<=0||ui>2)return;
        const auto geometry=career_scoreboard::layout((float)screen.X,(float)screen.Y,ui,counts[0],counts[1]);
        // Calibration affects this scoreboard only, not the career broadcast timer.
        float unit=geometry.unit*cvarManager->getCvar("rlm_scoreboard_scale").getFloatValue();
        float dx=cvarManager->getCvar("rlm_scoreboard_x").getFloatValue();
        float dy=cvarManager->getCvar("rlm_scoreboard_y").getFloatValue();
        const float oldScale=scale,oldLeft=left;scale=unit;left=0;
        int photos=0,titles=0;
        for(const auto& row:rows){
            float x=(geometry.x+dx)/unit;
            float y=((row.player.team?geometry.orangeY:geometry.blueY)+geometry.spacing*row.teamRow+dy)/unit;
            const auto& p=row.player;
            const float photoX=x+5; // Eight layout pixels right, names stay put.
            box(c,photoX,y-3,54,54,15,22,31);
            auto image=images.find(p.photo);
            if(image!=images.end()&&image->second->IsLoadedForCanvas()){
                picture(c,p.photo,photoX,y-3,54);photos++;
            }else centered(c,career_scoreboard::portraitInitial(p.gamertag),photoX,y+5,54,1.8,211,221,230);
            // Replace only the native name/title area; all stats and input hints
            // remain Rocket League's own scoreboard. Unknown awards stay blank.
            box(c,x+62,y,340,52,row.player.team?62:20,row.player.team?36:41,row.player.team?22:65);
            text(c,p.gamertag,x+67,y+(p.title.empty()?8:-2),1.8,245,247,251,326);
            if(!p.title.empty()){text(c,p.title,x+67,y+29,1.0,242,204,95,326);titles++;}
        }
        scale=oldScale;left=oldLeft;
        if(!scoreboardReported){scoreboardReported=true;cvarManager->log("RL Manager native scoreboard: "+std::to_string(rows.size())+" career players mapped; "+std::to_string(photos)+" portraits loaded; "+std::to_string(titles)+" verified titles. Photos follow player IDs, not bot engines.");}
    }
    void captureGameMessage(void* params){
        if(!feedEnabled()||!params)return;
        auto message=readString(reinterpret_cast<uintptr_t>(params)+8);
        auto lower=message;std::transform(lower.begin(),lower.end(),lower.begin(),[](unsigned char ch){return (char)std::tolower(ch);});
        if(lower.find("scored")==std::string::npos)return;
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;
        auto director=server.GetReplayDirector();if(!director)return;
        auto scored=director.GetReplayScoreData();auto name=careerName(std::to_string(scored.ScoredBy));
        if(name.empty())return;
        goalMessageAt=clockNow();goalMessageScorer=name;
        cvarManager->log("RL Manager goal announcement: "+name);
    }
    void replaceMessagePlayer(void* params){
        if(!params||!feedEnabled())return;
        // The message resolves its player object directly. This is not a
        // string search: identical bot names still identify different pros.
        struct MessageResult {uintptr_t object;uintptr_t text;int32_t count,capacity;};
        MessageResult value{};
        if(!readChecked(reinterpret_cast<uintptr_t>(params),value))return;
        auto name=careerName(std::to_string(value.object));if(name.empty())return;
        const auto previous=readString(reinterpret_cast<uintptr_t>(params)+8);
        if(previous.empty()||value.capacity>1024)return;
        if(previous==name){if(!nativeGoalNames){nativeGoalNames=true;cvarManager->log("RL Manager native message player: "+name+" (engine-sized name)");}return;}
        int length=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),nullptr,0);
        if(length<1||length+1>value.capacity)return;
        std::vector<wchar_t> replacement(length+1,0);
        MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,name.data(),(int)name.size(),replacement.data(),length);
        // Reuse the returned engine-owned allocation within its capacity.
        // Pointer, allocator, capacity and ownership never change.
        SIZE_T written=0;
        if(!WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(value.text),replacement.data(),replacement.size()*sizeof(wchar_t),&written)||written!=replacement.size()*sizeof(wchar_t))return;
        value.count=length+1;gameWrapper->OverrideParams(&value,sizeof(value));
        if(!nativeGoalNames){nativeGoalNames=true;cvarManager->log("RL Manager native message player: "+previous+" -> "+name);}
    }
    void replaceGoalMessage(void* params){
        if(!params||!feedEnabled())return;
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;
        auto director=server.GetReplayDirector();if(!director)return;
        auto scored=director.GetReplayScoreData();if(!scored.ScoredBy)return;
        auto alias=nameAliases.find(std::to_string(scored.ScoredBy));if(alias==nameAliases.end())return;
        auto message=readString(reinterpret_cast<uintptr_t>(params)+24);
        auto lower=message;std::transform(lower.begin(),lower.end(),lower.begin(),[](unsigned char c){return (char)std::tolower(c);});
        if(lower.find("scored")==std::string::npos)return;
        auto original=alias->second.original;std::transform(original.begin(),original.end(),original.begin(),[](unsigned char c){return (char)std::tolower(c);});
        auto pos=lower.find(original);if(pos==std::string::npos||original.empty())return;
        message.replace(pos,alias->second.original.size(),alias->second.career);
        struct FStringView {uintptr_t text;int32_t count,capacity;};FStringView value{};
        if(!readChecked(reinterpret_cast<uintptr_t>(params)+24,value)||value.capacity<1||value.capacity>1024)return;
        int length=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,message.data(),(int)message.size(),nullptr,0);if(length<1)return;
        // A longer career tag may not fit the engine's returned allocation.
        // Clear only that goal message and draw one replacement instead; never
        // resize an engine allocation or leave the original below our label.
        bool fallback=length+1>value.capacity;
        std::vector<wchar_t> replacement(fallback?1:length+1,0);
        if(!fallback)MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,message.data(),(int)message.size(),replacement.data(),length);
        SIZE_T written=0;
        if(!WriteProcessMemory(GetCurrentProcess(),reinterpret_cast<void*>(value.text),replacement.data(),replacement.size()*sizeof(wchar_t),&written)||written!=replacement.size()*sizeof(wchar_t))return;
        value.count=(int32_t)replacement.size();
        unsigned char packet[40];std::memcpy(packet,params,sizeof(packet));std::memcpy(packet+24,&value,sizeof(value));gameWrapper->OverrideParams(packet,sizeof(packet));
        goalLabelFallback=fallback;goalMessageAt=clockNow();goalMessageScorer=alias->second.career;
        cvarManager->log("RL Manager native goal message: "+goalMessageScorer+(fallback?" (single clean fallback)":" (native styling)"));
    }
    void drawGoalAnnouncement(CanvasWrapper& c){
        if(!goalLabelFallback||goalMessageScorer.empty()||clockNow()-goalMessageAt>4.5)return;
        auto server=gameWrapper->GetCurrentGameState();if(!server||server.GetbRoundActive())return;
        const auto screen=c.GetSize();float savedScale=scale,savedLeft=left;
        scale=std::min(screen.Y/1080.f,screen.X/1920.f);left=screen.X/2.f;
        const auto label=goalMessageScorer+" scored!";
        // This fallback is used only after clearing the native goal string.
        // Keep one replacement, with a shadow rather than a panel.
        const float width=textWidth(c,label,2.4f);
        text(c,label,-width/2+2,345,2.4f,12,17,23);
        text(c,label,-width/2,343,2.4f,255,235,191);
        scale=savedScale;left=savedLeft;
    }
    void drawReplayScorer(CanvasWrapper& c,const json& data){
        auto server=gameWrapper->GetCurrentGameState();if(!server)return;
        auto director=server.GetReplayDirector();if(!director)return;
        const auto scored=director.GetReplayScoreData();if(!scored.ScoredBy)return;
        // The hosted recording stays idle during playback and its live camera
        // still reports BallCam. Replicated score data identifies the complete
        // post-goal/replay interval, and clears before the next kickoff.
        if(server.GetbRoundActive())return;
        auto scorer=PriWrapper(scored.ScoredBy);if(!scorer)return;
        const auto nativeId=std::to_string(scored.ScoredBy);
        const auto scorerName=scorer.GetPlayerName().ToString();
        const json* role=nullptr;int side=-1;
        // The replay's own scorer PRI identifies the pro. Multiple copies of
        // BonkDaddy must never borrow one another's face or name.
        for(const auto& live:data.at("players")){
            auto id=live.value("nativeId",std::string{});
            if(id.empty()?live.value("name",std::string{})!=scorerName:id!=nativeId)continue;
            int team=live.value("team",-1);if(team<0||team>1)return;
            for(const auto& p:data.at("context").at(team?"orange":"blue").at("players"))
                if(p.value("playerId",std::string{})==live.value("playerId",std::string{})){
                    if(role)return;role=&p;side=team;
                }
        }
        if(!role)return;
        auto reported=nativeId+":"+std::to_string(scored.Time);
        if(replayReported!=reported){
            replayReported=reported;goalMessageAt=clockNow();goalMessageScorer=role->value("gamertag",std::string{});
            cvarManager->log("RL Manager replay scorer: "+goalMessageScorer+" bound to native PRI "+nativeId+"; speed="+std::to_string(scored.Speed)+"; assist="+careerName(std::to_string(scored.AssistedBy)));
        }
        if(detailed)return;
        const auto screen=c.GetSize();const float oldScale=scale,oldLeft=left;
        scale=std::min(screen.Y/1080.f,screen.X/1920.f);left=screen.X/2.f-250*scale;
        const float y=screen.Y/scale-235;
        box(c,0,y-18,500,208,13,19,28);
        box(c,0,y,500,34,side?225:21,side?104:128,side?25:221);
        centered(c,"GOAL SCORED BY",0,y+5,500,1.0);
        picture(c,role->value("photo",std::string{}),18,y+48,88);
        text(c,role->value("gamertag",std::string{}),122,y+51,2.0,245,247,251,358);
        text(c,role->value("title",std::string{}),122,y+99,.85,242,204,95,358);
        const auto& team=data.at("context").at(side?"orange":"blue");
        text(c,team.value("name",std::string{}),122,y+127,.85,187,202,216,358);
        std::string details;
        if(std::isfinite(scored.Speed)&&scored.Speed>0){
            bool metric=bool(gameWrapper->GetbMetric());
            // ReplayScoreData stores Unreal centimetres per second.
            details=std::to_string((int)std::lround(scored.Speed*(metric?.036:.0223693629)))+(metric?" KPH":" MPH");
        }
        auto assist=careerName(std::to_string(scored.AssistedBy));
        if(!assist.empty()&&scored.AssistedBy!=scored.ScoredBy){if(!details.empty())details+="  |  ";details+="ASSIST: "+assist;}
        if(!details.empty())text(c,details,18,y+155,1.0,225,237,246,464);
        scale=oldScale;left=oldLeft;
    }
    void box(CanvasWrapper& c,float x,float y,float w,float h,int r,int g,int b,int a=255){
        c.SetColor((char)r,(char)g,(char)b,(char)a);
        c.SetPosition(Vector2F{left+x*scale,y*scale});c.FillBox(Vector2F{w*scale,h*scale});
    }
    void crestPanel(CanvasWrapper& c,const json& team,float x,int side){
        // Black crest towers and original-colour logos, like the supplied
        // Worlds broadcast. Score colours remain independent of team branding.
        box(c,x,32,120,144,3,5,7);
        if(team.value("customBranding",false)){
            auto paint=[&](const std::string& key,float y,float h){
                const auto hex=team.value(key,std::string{});
                if(hex.size()!=7||hex[0]!='#'||!std::all_of(hex.begin()+1,hex.end(),[](unsigned char ch){return std::isxdigit(ch);}))return;
                const auto value=std::stoul(hex.substr(1),nullptr,16);
                box(c,x,y,120,h,(value>>16)&255,(value>>8)&255,value&255);
            };
            paint("brandSecondary",32,144);
            paint("brandColor",32,4);
        }
        box(c,x+(side?0:119),32,1,144,46,49,52);
        auto logo=team.value("logo",std::string{});
        if(images.find(logo)!=images.end())picture(c,logo,x+20,48,80);
        else centered(c,team.value("shortName",std::string{"?"}),x,69,120,2.0);
        centered(c,team.value("shortName",team.value("name",std::string{})),x,146,120,1.0);
    }
    const FontSet* fontFor(float size){
        const auto& fonts=italic?italicFonts:regularFonts;
        if(fonts.empty())return nullptr;
        float pixels=std::round(size*22.f*scale);
        return &*std::min_element(fonts.begin(),fonts.end(),[pixels](const auto& a,const auto& b){return std::abs(a.height-pixels)<std::abs(b.height-pixels);});
    }
    void text(CanvasWrapper& c,std::string s,float x,float y,float size=1,int r=238,int g=244,int b=248,float limit=0){
        auto font=fontFor(size);
        if(font){
            const auto& glyphs=font->glyphs;
            // Keep cached antialiasing intact by drawing at native pixel size.
            float cursor=0,factor=1.f;
            c.SetColor((char)r,(char)g,(char)b,(char)255);
            for(size_t i=0;i<s.size();){
                unsigned char lead=s[i];size_t n=lead<128?1:lead<224?2:lead<240?3:4;
                auto key=s.substr(i,n);i+=n;
                auto found=glyphs.find(key);if(found==glyphs.end())found=glyphs.find("?");
                if(found==glyphs.end())continue;
                const auto& glyph=found->second;
                if(limit>0&&cursor+glyph.advance*factor>limit*scale)break;
                c.SetPosition(Vector2F{std::round(left+x*scale+cursor-glyph.pad*factor),std::round(y*scale)});
                c.DrawTile(font->image.get(),std::round(glyph.width*factor),std::round(glyph.height*factor),glyph.x,glyph.y,glyph.width,glyph.height,LinearColor{r/255.f,g/255.f,b/255.f,1.f},0,2);
                cursor+=glyph.advance*factor;
            }
            return;
        }
        const float f=size*scale;
        if(limit>0){while(s.size()>3&&c.GetStringSize(s,f,f).X>limit*scale){s.pop_back();} }
        c.SetColor((char)r,(char)g,(char)b,(char)255);
        c.SetPosition(Vector2F{left+x*scale,y*scale});c.DrawString(s,f,f,false);
    }
    void centered(CanvasWrapper& c,const std::string& s,float x,float y,float width,float size,int r=245,int g=247,int b=251){
        auto font=fontFor(size);
        float measured=0;
        if(font){
            const auto& glyphs=font->glyphs;
            for(size_t i=0;i<s.size();){
                unsigned char lead=s[i];size_t n=lead<128?1:lead<224?2:lead<240?3:4;
                auto found=glyphs.find(s.substr(i,n));i+=n;
                if(found==glyphs.end())found=glyphs.find("?");
                if(found!=glyphs.end())measured+=found->second.advance/scale;
            }
        }else measured=c.GetStringSize(s,size*scale,size*scale).X/scale;
        text(c,s,x+(width-measured)/2,y,size,r,g,b);
    }
    void loadFonts(){
        try{
            std::ifstream file(folder/"fonts"/"glyphs.json");json data=json::parse(file);
            if(data.value("version",0)!=2)throw std::runtime_error("native font cache missing");
            for(auto style:{"regular","italic"}){
                auto& fonts=std::string(style)=="regular"?regularFonts:italicFonts;
                for(const auto& set:data.at(style)){
                    auto path=folder/"fonts"/set.at("file").get<std::string>();
                    auto image=std::make_shared<ImageWrapper>(path.wstring(),true,false);
                    if(!image->IsLoadedForCanvas())continue;
                    FontSet font{set.at("height").get<float>(),image,{}};
                    for(auto it=set.at("glyphs").begin();it!=set.at("glyphs").end();++it){const auto& v=it.value();font.glyphs.emplace(it.key(),Glyph{v.at("advance"),v.at("pad"),v.at("x"),v.at("y"),v.at("width"),v.at("height")});}
                    fonts.push_back(std::move(font));
                }
            }
        }catch(const std::exception&){cvarManager->log("RL Manager HUD: cached font assets missing; using game font fallback.");}
    }
    void picture(CanvasWrapper& c,const std::string& name,float x,float y,float extent){
        auto found=images.find(name);if(found==images.end()||!found->second->IsLoadedForCanvas())return;
        auto image=found->second;
        auto variants=imageSizes.find(name);
        float pixels=std::round(extent*scale);
        if(variants!=imageSizes.end())for(const auto& candidate:variants->second){
            auto a=candidate->GetSizeF(),b=image->GetSizeF();
            if(std::abs(std::max(a.X,a.Y)-pixels)<std::abs(std::max(b.X,b.Y)-pixels))image=candidate;
        }
        auto size=image->GetSizeF();if(size.X<=0||size.Y<=0)return;
        // Prepared variants are already antialiased at display resolution.
        // Drawing them 1:1 avoids the canvas's nearest-neighbour resampling.
        const bool prepared=variants!=imageSizes.end()&&!variants->second.empty();
        auto factor=prepared?1.f:std::min(extent/size.X,extent/size.Y)*scale;
        c.SetColor((char)255,(char)255,(char)255,(char)255);
        c.SetPosition(Vector2F{std::round(left+x*scale+(extent*scale-size.X*factor)/2),std::round(y*scale+(extent*scale-size.Y*factor)/2)});
        c.DrawTexture(image.get(),factor);
    }
    void loadImages(const json& context){
        images.clear();imageSizes.clear();
        for(auto side:{"blue","orange"}){
            const auto& team=context.at(side);
            std::vector<std::string> paths{team.value("logo",std::string{})};
            for(const auto& p:team.at("players"))paths.push_back(p.value("photo",std::string{}));
            for(const auto& p:paths)if(!p.empty()&&std::filesystem::exists(std::filesystem::u8path(p))){
                // Decode at most eight small local textures once per match.
                auto image=std::make_shared<ImageWrapper>(std::filesystem::u8path(p).wstring(),true,false);
                images.emplace(p,std::move(image));
                for(int pixels:{36,40,44,48,52,54,60,64,66,72,78,80,88,96,104,108,112,120,132,144,156,160,192}){
                    auto variant=std::filesystem::u8path(p+".px-"+std::to_string(pixels)+".png");
                    if(!std::filesystem::exists(variant))continue;
                    auto texture=std::make_shared<ImageWrapper>(variant.wstring(),true,false);
                    if(texture->IsLoadedForCanvas())imageSizes[p].push_back(std::move(texture));
                }
            }
        }
    }
    void render(CanvasWrapper c){
        if(!careerMatch()){lastRenderAt=0;return;}
        const auto start=clockNow();
        if(lastRenderAt&&start-lastRenderAt<.5)recordMaximum(worstFrameMicros,(uint64_t)((start-lastRenderAt)*1000000));
        lastRenderAt=start;
        drawFrame(c);
        auto cost=(uint64_t)((clockNow()-start)*1000000);
        renderMicros.fetch_add(cost);recordMaximum(worstRenderMicros,cost);renderCalls.fetch_add(1);
    }
    void drawFrame(CanvasWrapper c){
        if(!careerMatch())return;
        auto enabled=cvarManager->getCvar("rlm_hud_enabled");if(!enabled||!enabled.getBoolValue())return;
        std::shared_ptr<const json> value;{std::lock_guard<std::mutex> guard(lock);value=latest;}
        if(!value)return;
        try{
            const auto& data=*value;
            double now=std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();
            bool ended=data.value("ended",false);
            // Postmatch portraits survive the bridge stopping, until the game
            // instance is destroyed. Stale live match data is never displayed.
            if(now-data.value("updated",0.)>(ended?120.:2.))return;
            const auto& context=data.at("context");
            auto current=data.value("session",std::string{});
            if(current!=session){session=current;loadImages(context);scoreboardReported=false;scoreboardUnavailable=false;nameAliases.clear();nativeFeedNames.clear();feedNameRefresh.clear();feedRefreshOutcome.clear();nativeCarNames.clear();nameplateObjects.clear();nameplateCheckedAt.clear();namesReported=false;lastNameSync=0;}
            syncCareerNames(data);
            drawCareerNameplates(c);
            drawScoreboard(c,data);
            drawReplayScorer(c,data);
            // Goal announcements use the game's own presentation font and
            // layout; their player object resolves to the career identity.
            drawGoalAnnouncement(c);
            drawComms(c,data);
            if(ended)return;
            // Compact scorebug only: 540 x 132 at 1080p. Other HUD elements
            // keep their own scale, including the normal player scoreboard.
            auto screen=c.GetSize();scale=.75f*std::min(screen.Y/1080.f,screen.X/1920.f);left=(screen.X-720*scale)/2;
            // Worlds-inspired compact black towers, blue/gold scores and
            // white clock. No raster screenshot is stretched into the HUD.
            box(c,0,0,720,176,5,7,9);
            auto series=context.value("series",json::object());
            auto heading=context.value("event",std::string{"Career series"});
            for(char& ch:heading)if((unsigned char)ch<128)ch=(char)std::toupper((unsigned char)ch);
            float headingSize=1.0f;
            while(headingSize>.65f&&textWidth(c,heading,headingSize)>582)headingSize-=.05f;
            text(c,heading,14,5+(1-headingSize)*11,headingSize,245,246,247,582);
            text(c,"G"+std::to_string(series.value("gameNumber",1))+"  BO"+std::to_string(series.value("bestOf",3)),612,7,.85,187,192,197,100);
            for(int side=0;side<2;side++){
                const auto& team=context.at(side?"orange":"blue");float x=side?600.f:0.f;
                crestPanel(c,team,x,side);
            }
            {
                box(c,240,32,240,112,250,250,248);
                for(int strip=0;strip<28;strip++){
                    float t=strip/27.f;
                    box(c,120,32+strip*4,120,4,23+23*t,54+77*t,128+68*t);
                    box(c,480,32+strip*4,120,4,173+57*t,107+72*t,36+48*t);
                }
                box(c,120,32,120,2,89,150,225);box(c,480,32,120,2,248,211,127);
                box(c,120,142,480,2,46,49,52);
                italic=true;
                centered(c,std::to_string(data.value("blue",0)),120,41,120,4.2);
                centered(c,std::to_string(data.value("orange",0)),480,41,120,4.2);
                bool ot=data.value("overtime",false);
                double remaining=data.value("remaining",300.);
                int seconds=(int)std::ceil(ot?std::abs(remaining):std::max(0.,remaining));
                std::string clock=(ot?"+":"")+std::to_string(seconds/60)+":"+(seconds%60<10?"0":"")+std::to_string(seconds%60);
                centered(c,clock,240,49,240,ot?3.0:3.6,6,7,8);
                italic=false;
            }
            // Race to the shared middle: blue fills from the left, orange
            // from the right. The first side to reach the centre wins.
            int bestOf=std::clamp(series.value("bestOf",3),1,9);
            int needed=(bestOf+1)/2;
            int blueWins=std::clamp(series.value("blueWins",0),0,needed);
            int orangeWins=std::clamp(series.value("orangeWins",0),0,needed);
            float segment=468.f/bestOf;
            for(int j=0;j<bestOf;j++){
                float x=126+j*segment,width=segment-6;
                int winner=j<blueWins?0:j>=bestOf-orangeWins?1:-1;
                box(c,x,154,width,14,59,62,64);
                if(j==bestOf/2)box(c,x,154,width,14,241,209,112);
                box(c,x+2,156,width-4,10,winner==0?45:winner==1?218:34,winner==0?117:winner==1?165:37,winner==0?204:winner==1?67:39);
            }
            bool show=detailed; // Optional fallback panel only; Tab uses native rows.
            if(!show)return;
            scale=std::min(screen.Y/1080.f,screen.X/1120.f);left=(screen.X-1100*scale)/2;
            box(c,0,238,1100,460,14,19,27);
            for(int side=0;side<2;side++){
                float x=side?562.f:18.f;const auto& team=context.at(side?"orange":"blue");
                text(c,team.value("name",std::string{}),x+10,251,1.2,side?255:69,side?146:202,side?53:249,480);
                text(c,"PLAYER",x+12,300,.75,162,176,189);
                for(int stat=0;stat<5;stat++)text(c,std::vector<std::string>{"PTS","G","A","SV","SH"}[stat],x+320+stat*40,300,.65,162,176,189);
                int i=0;for(const auto& player:team.at("players")){
                    float y=327+i*100;box(c,x,y,520,88,22,30,41);
                    picture(c,player.value("photo",std::string{}),x+8,y+9,66);
                    text(c,player.value("gamertag",std::string{}),x+84,y+12,1.1,245,247,251,224);
                    text(c,player.value("title",std::string{}),x+84,y+45,.7,233,187,81,224);
                    json stats=json::object();
                    for(const auto& p:data.at("players"))if(p.value("playerId",std::string{})==player.value("playerId",std::string{})){stats=p;break;}
                    int n=0;for(auto stat:{"score","goals","assists","saves","shots"})text(c,std::to_string(stats.value(stat,0)),x+321+n++*40,y+25,.9);
                    i++;
                }
            }
        }catch(const std::exception&){ /* corrupt/stale telemetry never affects gameplay */ }
    }
public:
    ~RLManagerHUD(){running=false;if(reader.joinable())reader.join();}
    void onLoad() override{
        folder=gameWrapper->GetDataFolder()/"rl-manager";std::filesystem::create_directories(folder);
        loadFonts();
        cvarManager->registerCvar("rlm_hud_enabled","1","RL Manager fullscreen broadcast",true,true,0,true,1);
        cvarManager->registerCvar("rlm_scoreboard_enabled","1","Career portraits and titles on native scoreboard",true,true,0,true,1);
        cvarManager->registerCvar("rlm_scoreboard_x","0","Scoreboard portrait horizontal calibration in pixels",true,true,-500,true,500);
        cvarManager->registerCvar("rlm_scoreboard_y","0","Scoreboard portrait vertical calibration in pixels",true,true,-500,true,500);
        cvarManager->registerCvar("rlm_scoreboard_scale","1","Scoreboard portrait/text calibration",true,true,.5,true,1.5);
        cvarManager->registerCvar("rlm_teammate_boost","1","Show live boost of your two career teammates",true,true,0,true,1);
        cvarManager->registerCvar("rlm_legacy_nameplates","0","Opt in to old rectangular nameplate fallback",true,true,0,true,1);
        cvarManager->registerCvar("rlm_ticker_x","0","Native ticker name horizontal calibration",true,true,-400,true,400);
        cvarManager->registerCvar("rlm_ticker_y","0","Native ticker name vertical calibration",true,true,-200,true,200);
        cvarManager->registerNotifier("rlm_scoreboard",[this](std::vector<std::string>){detailed=!detailed;},"Toggle RL Manager player panel",PERMISSION_ALL);
        cvarManager->registerNotifier("rlm_host_arm",[this](std::vector<std::string>){armHosted();},"Arm career Rocket Host LAN telemetry",PERMISSION_ALL);
        cvarManager->registerNotifier("rlm_host_stop",[this](std::vector<std::string>){restoreNameplates();hostedSession.clear();hostedExpiry=0;hostedJoinReady=false;},"Stop career Rocket Host LAN telemetry",PERMISSION_ALL);
        cvarManager->registerNotifier("rlm_host_ready",[this](std::vector<std::string>){if(!hostedSession.empty())hostedJoinReady=true;},"Join the career team after the hosted bots are present",PERMISSION_ALL);
        gameWrapper->HookEventWithCaller<PlayerControllerWrapper>(changeTeamEvent,[this](PlayerControllerWrapper caller,void*,std::string){
            if(hostedSession.empty()||!careerMatch())return;auto local=gameWrapper->GetPlayerController();if(!local||local.memory_address!=caller.memory_address)return;
            int team=hostedJoinReady?0:2147483647;gameWrapper->OverrideParams(&team,sizeof(team));
        });
        gameWrapper->HookEventWithCaller<PriWrapper>(serverTeamEvent,[this](PriWrapper caller,void*,std::string){
            if(hostedSession.empty()||!careerMatch())return;auto local=gameWrapper->GetPlayerController();if(!local)return;auto pri=local.GetPRI();if(!pri||pri.memory_address!=caller.memory_address)return;
            int team=hostedJoinReady?0:2147483647;gameWrapper->OverrideParams(&team,sizeof(team));
        });
        gameWrapper->HookEvent(openEvent,[this](std::string){scoreboardOpen=true;scoreboardClosedAt=0;});
        gameWrapper->HookEvent(closeEvent,[this](std::string){if(scoreboardOpen){scoreboardOpen=false;scoreboardClosedAt=clockNow();closingReported=false;}});
        gameWrapper->HookEvent(destroyEvent,[this](std::string){resetScoreboard();});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(sortEvent,[this](ActorWrapper caller,void*,std::string){updateNativeOrder(caller);});
        gameWrapper->HookEvent(hudOpenEvent,[this](std::string){scoreboardOpen=true;scoreboardClosedAt=0;});
        gameWrapper->HookEvent(hudCloseEvent,[this](std::string){if(scoreboardOpen){scoreboardOpen=false;scoreboardClosedAt=clockNow();closingReported=false;}});
        gameWrapper->HookEventWithCaller<ActorWrapper>(priDataEvent,[this](ActorWrapper caller,void*,std::string){capturePRIData(caller);prepareUIName(caller);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(priDataEvent,[this](ActorWrapper caller,void*,std::string){restoreUINameInput();capturePRIData(caller);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(setPriEvent,[this](ActorWrapper caller,void*,std::string){capturePRIData(caller);});
        gameWrapper->HookEventWithCaller<ActorWrapper>(updateNameEvent,[this](ActorWrapper caller,void*,std::string){capturePRIData(caller);prepareUIName(caller,false,true);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(updateNameEvent,[this](ActorWrapper caller,void*,std::string){restoreUINameInput();capturePRIData(caller);});
        gameWrapper->HookEventWithCaller<ActorWrapper>(boundStringEvent,[this](ActorWrapper caller,void* params,std::string){prepareBoundPlayerName(caller,params);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(boundStringEvent,[this](ActorWrapper,void*,std::string){restoreBoundPlayerName();});
        gameWrapper->HookEventWithCaller<ActorWrapper>(plateNameEvent,[this](ActorWrapper caller,void*,std::string){prepareUIName(caller,true,true);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(plateNameEvent,[this](ActorWrapper caller,void*,std::string){restoreUINameInput();captureNameplate(caller,true);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(plateTickEvent,[this](ActorWrapper caller,void*,std::string){captureNameplate(caller);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(plateSetEvent,[this](ActorWrapper caller,void*,std::string){captureNameplate(caller,true);});
        gameWrapper->HookEventWithCaller<ActorWrapper>(plateGetEvent,[this](ActorWrapper caller,void*,std::string){auto pri=componentPRI(caller);auto id=pri.memory_address;prepareMessageName(&id);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(plateGetEvent,[this](ActorWrapper caller,void* params,std::string){restoreUINameInput();resolvePlateName(caller,params);});
        for(auto event:{hudNameEvent,hudResolveEvent}){
            gameWrapper->HookEventWithCaller<ActorWrapper>(event,[this](ActorWrapper,void* params,std::string){prepareMessageName(params);});
            gameWrapper->HookEventWithCallerPost<ActorWrapper>(event,[this](ActorWrapper,void* params,std::string){restoreUINameInput();resolveHUDName(params);});
        }
        gameWrapper->HookEventWithCaller<ActorWrapper>(tickerEvent,[this](ActorWrapper caller,void* params,std::string){prepareTickerHUD(caller,params);});
        gameWrapper->HookEventWithCaller<ActorWrapper>("Function TAGame.GFxHUD_TA.DrawHUD",[this](ActorWrapper caller,void*,std::string){currentNativeHUD=caller.memory_address;});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(tickerEvent,[this](ActorWrapper,void*,std::string){restoreUINameInput();restoreUINameInput();});
        gameWrapper->HookEventWithCaller<ActorWrapper>(tickerUIEvent,[this](ActorWrapper,void* params,std::string){prepareTickerUI(params);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(tickerUIEvent,[this](ActorWrapper,void*,std::string){restoreUINameInput();restoreUINameInput();});
        gameWrapper->HookEventWithCaller<ActorWrapper>(messageEvent,[this](ActorWrapper,void* params,std::string){captureGameMessage(params);});
        gameWrapper->HookEventWithCaller<ActorWrapper>(receiveMessageEvent,[this](ActorWrapper,void* params,std::string){captureGameMessage(params);});
        gameWrapper->HookEventWithCaller<ActorWrapper>(messageNameEvent,[this](ActorWrapper,void* params,std::string){prepareMessageName(params);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(messageNameEvent,[this](ActorWrapper,void* params,std::string){restoreUINameInput();replaceMessagePlayer(params);});
        gameWrapper->HookEventWithCallerPost<ActorWrapper>(messageTextEvent,[this](ActorWrapper,void* params,std::string){replaceGoalMessage(params);});
        gameWrapper->RegisterDrawable([this](CanvasWrapper canvas){render(canvas);});
        gameWrapper->HookEventWithCaller<PlayerControllerWrapper>(localChatEvent,[this](PlayerControllerWrapper caller,void* params,std::string){captureLocalComms(caller,params);});
        gameWrapper->HookEventWithCaller<PlayerControllerWrapper>(localChatInternalEvent,[this](PlayerControllerWrapper caller,void* params,std::string){captureLocalComms(caller,params);});
        running=true;
        reader=std::thread([this]{
            auto stateStamp=std::filesystem::file_time_type::min();
            std::shared_ptr<const json> writtenPacket;
            std::shared_ptr<const json> writtenComms;
            auto reportAt=clockNow();
            while(running){
                try{
                    std::error_code error;auto stamp=std::filesystem::last_write_time(folder/"state.json",error);
                    if(!error&&stamp!=stateStamp){
                        std::ifstream file(folder/"state.json",std::ios::binary|std::ios::ate);
                        if(file&&file.tellg()>0&&file.tellg()<65536){file.seekg(0);auto data=std::make_shared<const json>(json::parse(file));std::lock_guard<std::mutex> guard(lock);latest=data;stateStamp=stamp;}
                    }
                    std::shared_ptr<const json> packet;{std::lock_guard<std::mutex> guard(lock);packet=hostedPacket;}
                    if(packet&&packet!=writtenPacket){
                        auto temp=folder/"host-packet.tmp";std::ofstream(temp)<<*packet;
                        if(MoveFileExW(temp.c_str(),(folder/"host-packet.json").c_str(),MOVEFILE_REPLACE_EXISTING))writtenPacket=packet;
                    }
                    std::shared_ptr<const json> command;{std::lock_guard<std::mutex> guard(lock);command=pendingComms;}
                    if(command&&command!=writtenComms){auto temp=folder/"comms-command.tmp";std::ofstream(temp)<<*command;if(MoveFileExW(temp.c_str(),(folder/"comms-command.json").c_str(),MOVEFILE_REPLACE_EXISTING))writtenComms=command;}
                    auto now=clockNow();
                    if(now-reportAt>=1){
                        auto calls=renderCalls.exchange(0),micros=renderMicros.exchange(0),worst=worstRenderMicros.exchange(0),frame=worstFrameMicros.exchange(0);
                        if(calls){
                            auto temp=folder/"performance.tmp";
                            std::ofstream(temp)<<json{{"pid",GetCurrentProcessId()},{"updated",std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count()},
                                {"fps",calls/(now-reportAt)},{"renderCalls",calls},{"averageHUDMilliseconds",micros/(1000.*calls)},
                                {"worstHUDMilliseconds",worst/1000.},{"worstFrameMilliseconds",frame/1000.}};
                            MoveFileExW(temp.c_str(),(folder/"performance.json").c_str(),MOVEFILE_REPLACE_EXISTING);
                        }
                        reportAt=now;
                    }
                }catch(const std::exception&){}
                std::this_thread::sleep_for(std::chrono::milliseconds(20));
            }
        });
        std::ofstream(folder/"plugin-status.json")<<json{{"version","1.8.2"},{"loaded",true},{"nativeFonts",true},{"nativeScoreboard",true},{"rocketHostTelemetry",true},{"performanceMetrics",true},{"pid",GetCurrentProcessId()}};
        cvarManager->log("RL Manager HUD 1.8.2 loaded: native datastore publication, runtime car-label identities and per-update name binding; legacy nameplates disabled by default.");
    }
    void onUnload() override{
        gameWrapper->UnhookEvent("Function TAGame.GFxHUD_TA.DrawHUD");
        gameWrapper->UnhookEvent(localChatEvent);gameWrapper->UnhookEvent(localChatInternalEvent);
        *tickAlive=false;running=false;if(reader.joinable())reader.join();gameWrapper->UnregisterDrawables();
        for(auto event:{openEvent,closeEvent,destroyEvent,changeTeamEvent,serverTeamEvent,tickerEvent,tickerUIEvent,messageEvent,receiveMessageEvent,hudOpenEvent,hudCloseEvent,updateNameEvent,plateNameEvent,messageNameEvent,priDataEvent,boundStringEvent,plateGetEvent,hudNameEvent,hudResolveEvent})gameWrapper->UnhookEvent(event);
        for(auto event:{sortEvent,priDataEvent,setPriEvent,updateNameEvent,messageNameEvent,messageTextEvent,plateNameEvent,plateTickEvent,plateSetEvent,tickerEvent,tickerUIEvent,boundStringEvent,plateGetEvent,hudNameEvent,hudResolveEvent})gameWrapper->UnhookEventPost(event);resetScoreboard();
        std::ofstream(folder/"plugin-status.json")<<json{{"version","1.8.2"},{"loaded",false},{"pid",GetCurrentProcessId()}};
    }
};
BAKKESMOD_PLUGIN(RLManagerHUD,"RL Manager Fullscreen Broadcast","1.8.2",PLUGINTYPE_FREEPLAY)
