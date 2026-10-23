#pragma once
#include <algorithm>
#include <cmath>

namespace career_showcase {
struct Shot { double x,y,z,pitch,yaw,fov; };
inline double presentationTime(double elapsed,double updated,double now,bool running,double duration){
    // The bridge publishes at 10 Hz. Advance presentation-only animation on
    // every render frame, bounded by the same heartbeat expiry as camera control.
    return std::clamp(elapsed+(running?std::clamp(now-updated,0.,1.):0.),0.,duration);
}
inline double ease(double t){t=std::clamp(t,0.,1.);return t*t*(3.-2.*t);}
struct CardMotion { double opacity,offsetY; };
inline CardMotion cardMotion(double elapsed,double duration){
    const double enter=ease(elapsed/.55),leave=ease((duration-elapsed)/.45);
    return {enter*leave,28.*(1.-enter)+14.*(1.-leave)};
}
// A time-based ease keeps the same gentle arc at every frame rate. Showcase
// cars are parked away from walls; the short orbit stays inside the pitch.
inline Shot orbit(double x,double y,double z,double heading,double elapsed,double duration){
    constexpr double pi=3.141592653589793;
    const double t=std::clamp(elapsed/std::max(1.,duration),0.,1.);
    const double smooth=t*t*(3.-2.*t);
    const double angle=heading+pi*.18+(smooth-.5)*pi*.34;
    const double radius=410.-45.*smooth;
    const double cx=x+std::cos(angle)*radius,cy=y+std::sin(angle)*radius,cz=z+130.+20.*smooth;
    const double dx=x-cx,dy=y-cy,dz=z+38.-cz;
    return {cx,cy,cz,std::atan2(dz,std::hypot(dx,dy)),std::atan2(dy,dx),66.};
}
inline bool allowed(bool offline,bool paused,bool fresh,bool ended,double elapsed,int blue,int orange){
    return offline&&paused&&fresh&&!ended&&elapsed<1.&&blue==0&&orange==0;
}
}
